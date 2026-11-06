package openalex

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestSplitQuery(t *testing.T) {
	// Case 1: Small query should not be split
	smallQ := `("quantum computing" OR "qubits")`
	chunks := SplitQuery(smallQ, 3500)
	if len(chunks) != 1 || chunks[0] != smallQ {
		t.Fatalf("expected 1 chunk identical to small query, got %d chunks", len(chunks))
	}

	// Case 2: Synthesize a large query with 80 OR clauses and a NOT clause
	var terms []string
	for i := 0; i < 80; i++ {
		terms = append(terms, fmt.Sprintf(`("term_%03d_keyword_phrase_alpha" OR "term_%03d_keyword_phrase_beta")`, i, i))
	}
	largePositive := strings.Join(terms, " OR\n")
	largeQuery := fmt.Sprintf("(\n(\n%s\n)\nAND NOT\n(\n  \"irrelevant_topic_one\" OR \"irrelevant_topic_two\"\n)\n)", largePositive)

	if len(url.QueryEscape(largeQuery)) < 4000 {
		t.Fatalf("test setup error: largeQuery encoded len is only %d", len(url.QueryEscape(largeQuery)))
	}

	maxLimit := 2000
	chunks = SplitQuery(largeQuery, maxLimit)
	if len(chunks) <= 1 {
		t.Fatalf("expected multiple chunks, got %d", len(chunks))
	}

	t.Logf("Split large query of %d bytes into %d chunks", len(largeQuery), len(chunks))

	for i, ch := range chunks {
		encLen := len(url.QueryEscape(ch))
		t.Logf("Chunk %d: raw_len=%d, enc_len=%d", i, len(ch), encLen)

		// Each chunk must be within limits (or single large clause)
		if encLen > maxLimit+500 {
			t.Errorf("chunk %d exceeded limit: %d > %d", i, encLen, maxLimit)
		}

		// Validate syntax rules
		errs := ValidateKeywords(ch)
		if len(errs) > 0 {
			t.Errorf("chunk %d failed validation: %s\nContent:\n%s", i, strings.Join(errs, "; "), ch)
		}

		// Each chunk must include the NOT clause
		if !strings.Contains(ch, "irrelevant_topic_one") {
			t.Errorf("chunk %d is missing NOT clause", i)
		}
	}
}

func TestSplitQuery_WaferFabrication(t *testing.T) {
	data, err := os.ReadFile("/home/krishnakumar/StratumProjects/projects/wafer_fabrication/data/keywords.txt")
	if err != nil {
		t.Skip("skipping wafer fabrication test as file not present")
	}

	query := string(data)
	chunks := SplitQuery(query, 3500)
	t.Logf("Wafer fabrication query (%d bytes, %d enc bytes) split into %d chunks", len(query), len(url.QueryEscape(query)), len(chunks))

	if len(chunks) < 2 {
		t.Fatalf("expected wafer fabrication query to be split into at least 2 chunks, got %d", len(chunks))
	}

	for i, ch := range chunks {
		encLen := len(url.QueryEscape(ch))
		t.Logf("Chunk %d: raw_len=%d, enc_len=%d", i, len(ch), encLen)
		if encLen > 4000 {
			t.Errorf("chunk %d exceeds 4000 enc bytes limit: %d", i, encLen)
		}
		errs := ValidateKeywords(ch)
		if len(errs) > 0 {
			t.Errorf("chunk %d has syntax errors: %v", i, errs)
		}
		if !strings.Contains(ch, "cancer") {
			t.Errorf("chunk %d missing NOT clause (cancer)", i)
		}
	}
}
