# Local WordPress setup

Updated: 2026-09-22.

## Current environment

- Site: `http://127.0.0.1:8085`; dashboard: `http://127.0.0.1:8085/wp-admin/`.
- WordPress files: `local-wp2`; database: `local-wp2/wp-content/database/.ht.sqlite`.
- Server: portable PHP 8.3.33 built-in development server, not Apache/XAMPP.
- PHP executable: `.tools/php/php.exe`; configuration: `.tools/php/php.ini`.
- WP-CLI: `C:/wp-cli/wp-cli.phar`; PHPUnit: `.tools/phpunit.phar`.
- AI Diagnostic Bridge 0.1.5 is installed and active locally.
- WordPress is already installed and database writes have passed verification. Do not reinstall it or apply the old permission workaround unless a new check shows a problem.

## PHP configuration and repository access

The persistent php.ini enables PDO SQLite, SQLite3, OpenSSL, cURL, mbstring, ZIP, and fileinfo. It sets a 256 MB memory limit and 64 MB upload/post limits. TLS verification remains enabled; OpenSSL and cURL use WordPress's bundled CA certificate file at `local-wp2/wp-includes/certificates/ca-bundle.crt`.

The extension and certificate paths are absolute paths for this workspace. Update them if moving the project. Do not also add `-d extension=...` switches to commands now: those extensions are already loaded through php.ini.

Verified 2026-09-22:

- WordPress plugin search and theme search each returned results.
- Downloaded a Hello Dolly ZIP through WordPress's HTTPS download API, opened it successfully, and deleted the temporary file. No new plugin was installed or activated.
- WordPress filesystem method is `direct`.
- A temporary HTTP probe on the restarted server confirmed OpenSSL/cURL/ZIP enabled and WordPress.org HTTP 200. Probe was removed.
- Login page returned HTTP 200.

The agent sandbox blocks outbound requests that succeed outside it. The local web server was restarted outside that sandbox, so dashboard repository requests can work. Do not disable certificate verification to work around connection errors.

## Start the site after it stops

From the repository root in a normal PowerShell window:

```powershell
& '.\.tools\php\php.exe' -S 127.0.0.1:8085 -t '.\local-wp2'
```

Leave that terminal open. Do not start a second server while port 8085 is already in use. Restart the existing server after changing php.ini.

## WP-CLI and tests

From the repository root:

```powershell
& '.\.tools\php\php.exe' 'C:\wp-cli\wp-cli.phar' plugin list --path=local-wp2
& '.\.tools\php\php.exe' '.\.tools\phpunit.phar' --configuration phpunit.xml.dist --bootstrap tests/local-bootstrap.php
```

Latest plugin suite result: 40 tests, 629 assertions (2026-09-21). It was not rerun for the 2026-09-22 PHP connectivity change; repository/download and HTTP checks were used instead.

The test bootstrap uses the repository plugin source and a temporary SQLite snapshot, removed on shutdown, preserving the local site's credentials and log. It is not the official WordPress fixture framework. Run lifecycle experiments only on disposable local sites, never on the live Anbe Nigeria site.

## Course use

Brian is taking the **AI Powered WordPress** course. Repository access is repaired, but the course's specific AI plugin/provider has not yet been installed or verified. SQLite compatibility and each plugin's additional requirements still need checking when selected. Credentials belong in ignored local storage, never in this guide or the journal.
