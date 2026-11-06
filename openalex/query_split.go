package openalex

import (
	"net/url"
	"regexp"
	"strings"
)

var (
	reNotPrefix = regexp.MustCompile(`^(?i)\s*(?:AND\s+)?NOT\s*[\(\s]`)
	reORPrefix  = regexp.MustCompile(`^(?i)\s+OR\s+`)
)

// SplitQuery splits a Boolean query into smaller valid chunks if its URL-encoded length
// exceeds maxEncodedLen (recommended default: 3500 bytes, well within OpenAlex's 8190-byte limit).
// It preserves parenthesis balance, logical grouping, and attaches any trailing NOT/AND NOT clauses
// to every chunk so results remain mathematically identical to the original query.
func SplitQuery(query string, maxEncodedLen int) []string {
	if maxEncodedLen <= 0 {
		maxEncodedLen = 3500
	}

	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return []string{""}
	}

	// If already within safe URL limits, return as single chunk
	if len(url.QueryEscape(trimmed)) <= maxEncodedLen {
		return []string{trimmed}
	}

	// Unwrap outermost parentheses if they enclose the whole query
	unwrapped := unwrapOuterParens(trimmed)

	// Detect top-level NOT / AND NOT clause outside parentheses and quotes
	posPart, notClause := extractTopLevelNot(unwrapped)

	// Unwrap positive part
	posUnwrapped := unwrapOuterParens(posPart)

	// Split positive part by top-level OR clauses (at depth 0)
	clauses := splitByTopLevelOR(posUnwrapped)

	// If clauses cannot be split at top level, check if any sub-clause can be broken down
	if len(clauses) <= 1 {
		return []string{trimmed}
	}

	// Flatten clauses if any individual clause is still larger than maxEncodedLen
	var flattenedClauses []string
	for _, cl := range clauses {
		clTrimmed := strings.TrimSpace(cl)
		if len(url.QueryEscape(clTrimmed)) > maxEncodedLen {
			innerUnwrapped := unwrapOuterParens(clTrimmed)
			innerClauses := splitByTopLevelOR(innerUnwrapped)
			if len(innerClauses) > 1 {
				flattenedClauses = append(flattenedClauses, innerClauses...)
				continue
			}
		}
		flattenedClauses = append(flattenedClauses, clTrimmed)
	}

	// Group clauses into chunks where each chunk's URL-encoded length <= maxEncodedLen
	var chunks []string
	var currentClauses []string

	buildChunk := func(cls []string) string {
		if len(cls) == 0 {
			return ""
		}
		var body string
		if len(cls) == 1 {
			body = cls[0]
		} else {
			body = strings.Join(cls, " OR\n")
		}

		trimmedBody := strings.TrimSpace(body)
		if !strings.HasPrefix(trimmedBody, "(") || !strings.HasSuffix(trimmedBody, ")") {
			body = "(\n" + body + "\n)"
		}
		if notClause != "" {
			return body + "\n" + notClause
		}
		return body
	}

	for _, cl := range flattenedClauses {
		candidateList := append(currentClauses, cl)
		testChunk := buildChunk(candidateList)

		if len(currentClauses) > 0 && len(url.QueryEscape(testChunk)) > maxEncodedLen {
			chunks = append(chunks, buildChunk(currentClauses))
			currentClauses = []string{cl}
		} else {
			currentClauses = candidateList
		}
	}

	if len(currentClauses) > 0 {
		chunks = append(chunks, buildChunk(currentClauses))
	}

	if len(chunks) == 0 {
		return []string{trimmed}
	}

	return chunks
}

// unwrapOuterParens repeatedly strips matching outer '(' and ')' if they wrap the entire string.
func unwrapOuterParens(s string) string {
	s = strings.TrimSpace(s)
	for strings.HasPrefix(s, "(") && strings.HasSuffix(s, ")") {
		depth := 0
		inQuote := false
		matchedEnd := false

		for i := 0; i < len(s); i++ {
			c := s[i]
			if c == '\\' && inQuote {
				i++
				continue
			}
			if c == '"' {
				inQuote = !inQuote
			} else if !inQuote {
				if c == '(' {
					depth++
				} else if c == ')' {
					depth--
					if depth == 0 {
						if i == len(s)-1 {
							matchedEnd = true
						}
						break
					}
				}
			}
		}

		if matchedEnd {
			s = strings.TrimSpace(s[1 : len(s)-1])
		} else {
			break
		}
	}
	return s
}

// extractTopLevelNot detects and splits a top-level NOT / AND NOT clause outside parentheses.
func extractTopLevelNot(s string) (string, string) {
	depth := 0
	inQuote := false

	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '\\' && inQuote {
			i++
			continue
		}
		if c == '"' {
			inQuote = !inQuote
		} else if !inQuote {
			if c == '(' {
				depth++
			} else if c == ')' {
				depth--
			} else if depth == 0 {
				sub := s[i:]
				if loc := reNotPrefix.FindStringIndex(sub); loc != nil && loc[0] == 0 {
					posPart := strings.TrimSpace(s[:i])
					notClause := strings.TrimSpace(s[i:])
					return posPart, notClause
				}
			}
		}
	}
	return s, ""
}

// splitByTopLevelOR splits a query string into constituent OR clauses at depth 0 outside quotes.
func splitByTopLevelOR(s string) []string {
	var clauses []string
	var cur strings.Builder
	depth := 0
	inQuote := false

	i := 0
	for i < len(s) {
		c := s[i]
		if c == '\\' && inQuote {
			cur.WriteByte(c)
			i++
			if i < len(s) {
				cur.WriteByte(s[i])
				i++
			}
			continue
		}

		if c == '"' {
			inQuote = !inQuote
			cur.WriteByte(c)
			i++
		} else if !inQuote {
			if c == '(' {
				depth++
				cur.WriteByte(c)
				i++
			} else if c == ')' {
				depth--
				cur.WriteByte(c)
				i++
			} else if depth == 0 {
				sub := s[i:]
				if loc := reORPrefix.FindStringIndex(sub); loc != nil && loc[0] == 0 {
					clause := strings.TrimSpace(cur.String())
					if clause != "" {
						clauses = append(clauses, clause)
					}
					cur.Reset()
					i += loc[1]
					continue
				}
				cur.WriteByte(c)
				i++
			} else {
				cur.WriteByte(c)
				i++
			}
		} else {
			cur.WriteByte(c)
			i++
		}
	}

	last := strings.TrimSpace(cur.String())
	if last != "" {
		clauses = append(clauses, last)
	}

	return clauses
}
