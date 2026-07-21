// Package sqlitedb opens SQLite files in a cross-platform way.
// The file: URI form breaks on Windows drive letters (C:\...); a plain
// path + query string works with modernc.org/sqlite on all platforms.
package sqlitedb

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

// OpenReadonly opens path for read-only queries.
func OpenReadonly(path string) (*sql.DB, error) {
	return sql.Open("sqlite", path+"?mode=ro")
}
