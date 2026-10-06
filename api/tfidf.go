package api

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

//go:embed scripts/tfidf_keybert.py
var tfidfScript []byte

type tfidfRequest struct {
	Filename       string  `json:"filename"`
	TitleColumn    string  `json:"title_column"`
	AbstractColumn string  `json:"abstract_column"`
	DOIColumn      string  `json:"doi_column"`
	TopN           int      `json:"top_n"`
	TfidfShare     *float64 `json:"tfidf_share"` // 0..1 fraction taken from TF-IDF
	Alpha          *float64 `json:"alpha"`
	NgramMin       int      `json:"ngram_min"`
	NgramMax       int     `json:"ngram_max"`
	MinDF          int     `json:"min_df"`
	MaxDF          float64 `json:"max_df"`
	UseKeyBERT     bool    `json:"use_keybert"`
	KeyBERTModel   string  `json:"keybert_model"`
}

func getPythonExecutable() string {
	if v := strings.TrimSpace(os.Getenv("STRATUM_PYTHON")); v != "" {
		if fi, err := os.Stat(v); err == nil && !fi.IsDir() {
			return v
		}
		if pathBin, err := exec.LookPath(v); err == nil {
			return pathBin
		}
	}
	return findPythonInterpreter()
}

func writeTFIDFScript() (string, error) {
	f, err := os.CreateTemp("", "tfidf_keybert_*.py")
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.Write(tfidfScript); err != nil {
		return "", err
	}
	return f.Name(), nil
}

// saveAnchors merges new DOIs into the anchors column of config.db (no duplicates).
func (s *APIServer) saveAnchors(project string, dois []string) error {
	dbConn, err := s.getConfigDB(project)
	if err != nil {
		return err
	}
	var existing string
	_ = dbConn.QueryRow("SELECT COALESCE(anchors,'') FROM config WHERE id = 1").Scan(&existing)

	seen := map[string]bool{}
	var merged []string
	for _, line := range append(strings.Split(existing, "\n"), dois...) {
		line = strings.TrimSpace(line)
		key := strings.ToLower(line)
		if line == "" || seen[key] {
			continue
		}
		seen[key] = true
		merged = append(merged, line)
	}
	_, err = dbConn.Exec("UPDATE config SET anchors = ? WHERE id = 1", strings.Join(merged, "\n"))
	return err
}

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// handleTFIDF runs TF-IDF and KeyBERT in parallel (inside the Python script).
// Of top_n keywords, tfidf_share go to TF-IDF and the remainder to KeyBERT.
func (s *APIServer) handleTFIDF(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	project := r.URL.Query().Get("project")

	var req tfidfRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request: "+err.Error())
		return
	}
	if strings.TrimSpace(req.Filename) == "" {
		writeJSONError(w, http.StatusBadRequest, "No uploaded file selected")
		return
	}
	if req.TopN <= 0 {
		req.TopN = 50
	}
	// Default TF-IDF combination score weight is 10% (0.10) unless explicitly specified
	alpha := 0.10
	if req.Alpha != nil {
		alpha = *req.Alpha
	} else if req.TfidfShare != nil {
		alpha = *req.TfidfShare
	}
	if alpha < 0 {
		alpha = 0
	}
	if alpha > 1 {
		alpha = 1
	}
	alphaVal := alpha
	req.Alpha = &alphaVal
	req.TfidfShare = &alphaVal

	if req.MinDF <= 0 {
		req.MinDF = 1
	}
	if req.MaxDF <= 0 || req.MaxDF > 1 {
		req.MaxDF = 0.85
	}
	if req.NgramMin <= 0 {
		req.NgramMin = 1
	}
	if req.NgramMax < req.NgramMin {
		req.NgramMax = req.NgramMin
	}
	if strings.TrimSpace(req.KeyBERTModel) == "" {
		req.KeyBERTModel = "allenai-specter"
	}

	_, _, _, _, uploadsDir := s.getProjectPaths(project)
	uploadPath := filepath.Join(uploadsDir, filepath.Base(req.Filename))
	if _, err := os.Stat(uploadPath); err != nil {
		writeJSONError(w, http.StatusNotFound, "Uploaded file not found: "+uploadPath)
		return
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"path":            uploadPath,
		"title_column":    req.TitleColumn,
		"abstract_column": req.AbstractColumn,
		"doi_column":      req.DOIColumn,
		"top_n":           req.TopN,
		"alpha":           *req.Alpha,
		"tfidf_share":     *req.TfidfShare,
		"ngram_min":       req.NgramMin,
		"ngram_max":       req.NgramMax,
		"min_df":          req.MinDF,
		"max_df":          req.MaxDF,
		"use_keybert":     req.UseKeyBERT,
		"keybert_model":   req.KeyBERTModel,
	})

	scriptPath, err := writeTFIDFScript()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Could not prepare extraction script: "+err.Error())
		return
	}
	defer os.Remove(scriptPath)

	// First KeyBERT run downloads the model, so allow plenty of time.
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Minute)
	defer cancel()

	pythonBin := getPythonExecutable()
	cmd := exec.CommandContext(ctx, pythonBin, scriptPath)
	cmd.Stdin = bytes.NewReader(payload)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr

	if err := cmd.Run(); err != nil {
		writeJSONError(w, http.StatusInternalServerError,
			"Extraction failed: "+err.Error()+" | "+strings.TrimSpace(stderr.String()))
		return
	}

	var out struct {
		Keywords []map[string]interface{} `json:"keywords"`
		DOIs     []string                 `json:"dois"`
		Warnings []string                 `json:"warnings"`
		Error    string                   `json:"error"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &out); err != nil {
		writeJSONError(w, http.StatusInternalServerError,
			"Bad script output: "+err.Error()+" | "+strings.TrimSpace(stderr.String()))
		return
	}
	if out.Error != "" {
		writeJSONError(w, http.StatusBadRequest, out.Error)
		return
	}

	if len(out.DOIs) > 0 {
		if err := s.saveAnchors(project, out.DOIs); err != nil {
			out.Warnings = append(out.Warnings, "Could not save anchors: "+err.Error())
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"keywords":      out.Keywords,
		"anchors_count": len(out.DOIs),
		"warnings":      out.Warnings,
	})
}
