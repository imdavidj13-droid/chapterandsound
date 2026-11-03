# Email route priority regression

The homepage must not overwrite the verification component when `#verify-email=` is present. This check runs TypeScript, all unit and migration tests, and the production build. After deployment, a deliberately invalid test token must produce the verification error screen, never the homepage.
