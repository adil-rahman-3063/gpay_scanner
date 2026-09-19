# GPay Cam 📸💸

**Live App:** [https://gpay-scanner.pages.dev](https://gpay-scanner.pages.dev)

## The Problem
If your primary phone camera sensor breaks (e.g., hardware failure, black screen on the 1x lens), native payment apps like Google Pay, Paytm, and PhonePe become completely unusable for scanning QR codes. These apps stubbornly default to the broken primary 1x camera and do not provide a way to switch to your working secondary lenses (like the 2x telephoto or ultrawide).

## The Solution
**GPay Cam** is a custom WebRTC Next.js web application built to solve exactly this problem. It allows you to:
- **Force the 2x Telephoto Lens:** Bypasses the broken main camera by forcefully requesting the `telephoto` or `environment` facing mode using HTML5 video constraints.
- **Deep-link directly to GPay:** Scans both standard UPI QR codes (`upi://...`) and raw Bank EMVCo/BharatQR codes (`000201...`). It automatically intercepts the payload and strictly forces the Google Pay native app to launch on both Android and iOS, bypassing any app-choosers (like WhatsApp) and dropping you straight into the "Enter Amount" screen.

## Features
- **Dark-themed, Mobile-first UI:** Built with Tailwind CSS for a seamless, native-app feel.
- **Smart Payload Parsing:** Transforms EMVCo bank codes into `qrPayload` strings that GPay natively understands.
- **Strict Intent Routing:** 
  - **Android:** Uses exact package intents (`intent://...#Intent;package=com.google.android.apps.nbu.paisa.user;scheme=upi;end`)
  - **iOS:** Uses the direct GPay scheme (`gpay://upi/pay?...`)

## Tech Stack
- **Framework:** Next.js (App Router), React
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **QR Decoding:** `html5-qrcode`

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. To test on a mobile device, use a tunneling service (HTTPS is required for Camera APIs):
   ```bash
   npx cloudflared tunnel --url http://localhost:3000 --http-host-header localhost
   ```
