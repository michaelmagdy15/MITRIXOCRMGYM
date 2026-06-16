<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3bf9459f-b695-4194-82c1-3b715e42610f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deployment

### Deploy to Netlify

This project is configured for seamless deployment on Netlify.

1.  **Push to GitHub**: Connect your repository to a GitHub account.
2.  **Connect to Netlify**:
    - Create a new site from Git in the Netlify dashboard.
    - Select your repository.
    - Build settings will be automatically detected from [netlify.toml](netlify.toml):
        - **Build command**: `npm run build`
        - **Publish directory**: `dist`
3.  **Environment Variables**:
    - Go to **Site configuration > Build & deploy > Environment variables**.
    - Add `GEMINI_API_KEY` with your Google Gemini API key.

Once configured, every push to your main branch will automatically trigger a deployment.

