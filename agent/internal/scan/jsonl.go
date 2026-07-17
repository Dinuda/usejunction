package scan

import (
	"bufio"
	"errors"
	"io"
)

// Default max line size kept for parsing. Larger lines (tool outputs, images)
// are discarded until the next newline so scanning never aborts mid-file.
const defaultJSONLMaxKeep = 8 << 20 // 8 MiB

// errStopJSONL ends forEachJSONLLine early without treating it as a failure.
var errStopJSONL = errors.New("stop jsonl iteration")

// forEachJSONLLine reads r line-by-line and calls fn for each line at or under
// maxKeep bytes (trailing newline stripped). Lines larger than maxKeep are
// discarded until '\n' without invoking fn, so oversized payloads never stop
// later usage events from being processed. A final line without a trailing
// newline is still delivered when under maxKeep.
// Returning errStopJSONL from fn stops iteration and yields a nil error.
func forEachJSONLLine(r io.Reader, maxKeep int, fn func(line []byte) error) error {
	if maxKeep <= 0 {
		maxKeep = defaultJSONLMaxKeep
	}
	br := bufio.NewReaderSize(r, 1<<20)

	for {
		line, err := readJSONLLine(br, maxKeep)
		if len(line) > 0 {
			if fnErr := fn(line); fnErr != nil {
				if errors.Is(fnErr, errStopJSONL) {
					return nil
				}
				return fnErr
			}
		}
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

// readJSONLLine returns the next line without a trailing newline.
// Oversized lines are fully consumed and return (nil, nil) so scanning continues.
func readJSONLLine(br *bufio.Reader, maxKeep int) ([]byte, error) {
	var buf []byte
	for {
		part, err := br.ReadSlice('\n')
		switch err {
		case nil:
			buf = append(buf, part...)
			if len(buf) > maxKeep {
				return nil, nil
			}
			return cloneTrimNewline(buf), nil

		case io.EOF:
			if len(part) > 0 {
				buf = append(buf, part...)
			}
			if len(buf) == 0 {
				return nil, io.EOF
			}
			if len(buf) > maxKeep {
				return nil, io.EOF
			}
			return cloneTrimNewline(buf), io.EOF

		case bufio.ErrBufferFull:
			buf = append(buf, part...)
			if len(buf) > maxKeep {
				if dErr := discardUntilNewline(br); dErr != nil && dErr != io.EOF {
					return nil, dErr
				} else if dErr == io.EOF {
					return nil, io.EOF
				}
				return nil, nil
			}
			continue

		default:
			return nil, err
		}
	}
}

func discardUntilNewline(br *bufio.Reader) error {
	for {
		_, err := br.ReadSlice('\n')
		if err == nil || err == io.EOF {
			return err
		}
		if err != bufio.ErrBufferFull {
			return err
		}
	}
}

func cloneTrimNewline(line []byte) []byte {
	n := len(line)
	if n > 0 && line[n-1] == '\n' {
		n--
		if n > 0 && line[n-1] == '\r' {
			n--
		}
	}
	out := make([]byte, n)
	copy(out, line[:n])
	return out
}
