# AUREA backend

Install Python 3.12 or newer with PATH enabled. From PowerShell in `backend`, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Use this command after pulling changes too. It creates a local `.venv`, preserves
a broken environment as `.venv-backup-*`, and installs `requirements.txt` whenever
it changes. No activation is required. Add `-SetupOnly` to prepare dependencies
without starting the server. Keep credentials in `backend/.env`.

Each teammate must create their own environment. Never commit `.venv`, backups,
or installed packages: virtual environments contain absolute paths to the PC
that created them. Share dependency changes through `requirements.txt` instead.

This migration removes the previously committed environment from Git. After
pulling it, run the command above to rebuild locally. Commit and push the staged
environment removals together with the script and documentation so the whole
team receives the fix.

Before deploying announcement replacement, run
`migrations/025_replace_announcement.sql` in the Supabase SQL editor. Publishing
a new announcement then deletes all previous announcements in the same
transaction. Existing announcements stay in place until the next successful
publication. If the new insert fails, the previous announcement is preserved.

The population dashboard reads `/api/population/pateros`. The backend checks the
official PSA Pateros PSGC page at most daily and validates that barangay counts
sum to the municipal total before accepting a release. It saves successful
results under `.cache/` and retains the verified bundled snapshot if PSA blocks
requests or changes its page format. Failed checks retry after one hour. The UI
shows the census year, last verification date, source links, and saved-data status.
The separately labelled 2020 household age chart is historical and does not
automatically update from the PSGC population page, which has no age breakdown.
