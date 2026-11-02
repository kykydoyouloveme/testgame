# Battle Ground account starter

Register and log in before the Battle Ground game is built. The register tab is the first screen. Accounts require a Gmail address and a one-time code delivered to that inbox before they are created. User records and pending verification codes are stored in MongoDB.

## Run locally

1. Install Node.js 20 or newer and run `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, a long random `JWT_SECRET`, `GMAIL_USER`, and `GMAIL_APP_PASSWORD`.
3. In Google Account security settings, enable 2-Step Verification and create an App Password for Gmail. Use that password in `GMAIL_APP_PASSWORD`; do not use your regular Gmail password.
4. Ensure MongoDB is running locally, or use a MongoDB Atlas connection string.
5. Run `npm start` and open `http://localhost:3000`.

Verification codes expire after 10 minutes and allow at most five attempts. API requests are rate limited. JWTs last seven days. The post-login screen is a placeholder for the upcoming Battle Ground game.

## Production notes

Use HTTPS, a strong unique JWT secret, and a managed MongoDB deployment. Configure Gmail SMTP with a dedicated sending account and App Password. The current Gmail check accepts `@gmail.com` addresses; actual ownership is confirmed by the email code.
