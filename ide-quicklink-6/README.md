# Project Echo — Accessible Multimodal Communication

Project Echo is an accessible communication prototype designed to bridge speech and communication difficulties through voice, facial cues, gestures, context, and Google Authentication.

## Firebase Authentication & Cloud Firestore Setup

Project Echo integrates real Google sign-in using Firebase Authentication and Cloud Firestore for user profile metadata storage (`users/{uid}`).

### 1. Automated Setup via AI Studio
The Firebase project and Cloud Firestore database instance have been provisioned:
- **Firebase Project ID**: `gen-lang-client-0611544051`
- **Firestore Database ID**: `ai-studio-idequicklink-777e40b6-a549-402b-8397-32f377be005e`
- **Security Rules**: Deployed automatically via `firestore.rules`.

### 2. Manual Firebase Console Steps Required
To ensure seamless Google Sign-In in all environments (preview iframe and custom domains), complete the following steps in the [Firebase Console](https://console.firebase.google.com/project/gen-lang-client-0611544051):

#### A. Enable Google & Email/Password Sign-in Providers
1. Go to **Firebase Console** > **Authentication** > **Sign-in method**.
2. Click **Google** > Toggle **Enable** > Set project support email > Click **Save**.
3. Click **Add new provider** > Select **Email/Password** > Toggle **Enable** > Click **Save**.

#### B. Add Authorized Domains
Firebase Authentication restricts popup sign-ins to allowed domains.
1. In **Authentication** > **Settings** > **Authorized domains**, click **Add domain**.
2. Add your development and production preview hosting domains:
   - `ais-dev-ic5qvgzz57wtjrkfyojdmw-567754418212.asia-east1.run.app`
   - `ais-pre-ic5qvgzz57wtjrkfyojdmw-567754418212.asia-east1.run.app`
   - Any custom domain you point to your deployment.
3. Click **Add**.

#### C. Verify Cloud Firestore Security Rules
Security rules are defined in `firestore.rules`. Each authenticated user can read and update only their own profile at `users/{userId}`:
```javascript
match /users/{userId} {
  allow get: if isOwner(userId);
  allow list: if false;
  allow create: if isOwner(userId) && ...;
  allow update: if isOwner(userId) && incoming().createdAt == existing().createdAt && ...;
  allow delete: if false;
}
```

### 3. Data Structure & Privacy
- **Collection**: `/users/{userId}`
- **Fields Stored**:
  - `uid`: Unique Firebase Authentication user ID
  - `displayName`: Google account display name
  - `email`: Google account email
  - `photoURL`: Google profile avatar URL
  - `createdAt`: Timestamp preserved upon initial sign-in
  - `lastLoginAt`: Server timestamp updated on each session
- **Zero Credential Storage**: No Google passwords, OAuth refresh tokens, or credentials are ever stored in Firestore or client storage.

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env.local` with your public Firebase configuration or use `firebase-applet-config.json`.
3. To use the AI chat locally, add `GEMINI_API_KEY=your_key` to `.env.local`. The key is read by the Vite server and is not exposed in browser code. The chat uses Gemini 3.8 Flash through the server-side `/api/chat` route.
4. Start development server:
   ```bash
   npm run dev
   ```
