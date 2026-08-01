# configtest

Helpers for agent tests that touch `config.ConfigDir()` / `config.CacheDir()`.

## Use `WithIsolatedHome`, not `HOME`

`ConfigDir()` and `CacheDir()` resolve from:

1. In-process configured home (CLI `--home` / `ApplyRuntimeProfile`)
2. `USEJUNCTION_HOME`
3. `USEJUNCTION_PROFILE` + `os.UserHomeDir()`

They do **not** read the `HOME` environment variable. On Windows CI, setting `HOME` to a temp dir while leaving `USEJUNCTION_HOME` unset still resolves paths under the real user profile — tests that only set `HOME` are flaky or wrong.

```go
home := configtest.WithIsolatedHome(t)
path := configtest.CacheFile(t, "cursor-usage-events.json")
```

`CacheFile` asserts the standard `cache/cost-usage/<name>` layout under the isolated home.
