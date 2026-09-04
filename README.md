<div align="center">

# 🎬 LuminaTube

### Next-Generation Interactive Live Streaming & VOD Platform

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io)
[![SQLite](https://img.shields.io/badge/SQLite-Native_Sync-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-0047AB?style=for-the-badge)](LICENSE)

<p align="center">
  <b>LuminaTube</b> is a lightweight, self-hosted, full-stack video and live broadcasting platform designed for community engagement, live discussions, and creator empowerment — wrapped in an elegant <b>Midnight Navy & Cobalt Blue</b> design system.
</p>

[Key Features](#-key-features) •
[Color Palette](#-color-palette--design-system) •
[Quick Start](#-quick-start) •
[Custom Domain Setup](#-connecting-a-custom-domain--production-setup) •
[Broadcasting via OBS](#-broadcasting-via-obs-studio) •
[Architecture](#-architecture) •
[API & WebSockets](#-api--websocket-events)

</div>

---

## ✨ Key Features

### 📡 Adaptive Media & Broadcasting
* **Dual Broadcasting Modes**:
  * **Live RTMP Ingestion**: Stream seamlessly via **OBS Studio**, **Streamlabs**, or **PRISM Live** using unique private stream keys.
  * **Direct Video File Upload (VOD)**: Upload pre-recorded `.mp4` and `.webm` files directly through the web Studio (up to 500 MB).
* **Adaptive Player (HLS.js)**: Multi-bitrate switching (Auto, 720p, etc.), low-latency buffering, retry reconnection logic, and native Safari/iOS HLS fallback.
* **Automated VOD Archival**: Stream recordings are instantly indexed as past broadcasts with automatic expiration handling.

### 💬 Real-Time Live Chat
* **Ultra-Low Latency**: Powered by WebSockets via **Socket.IO** with dynamic room isolation.
* **Role Hierarchy Badges**: Visual identification for Stream Host (`Owner`), Platform Staff (`Admin`), and Channel Custodians (`Moderator`).
* **Chat Control & Safety**:
  * **Slow Mode Engine**: Dynamic throttle countdowns prevent chat flooding.
  * **Pinned Announcements**: Pin important creator messages to the chat header.
  * **Interactive Moderation**: Context menu for single-click timeouts (5m, 1h), permanent bans, unbans, and message deletion.
  * **Quick Emoji Bar & Mentions**: Single-tap emoji reactions and `@username` auto-insertion.

### 🎛️ Creator Studio (`/studio`)
* **Direct Video Uploader**: Simple drag-and-drop or file selection for `.mp4` and `.webm` files with custom thumbnail support.
* **Channel Customization**: Upload square avatars (JPG, PNG, WebP) with client-side canvas preview, custom bio, and donation links (`idonate.uz` integration).
* **Broadcast Configuration**: Secret stream key regeneration, upcoming broadcast title, custom 16:9 thumbnail upload, and slow mode delay toggles.
* **Content Management**: Visibility toggles (**Public** vs **Private**), metadata editor, and one-click deletion.
* **Community Dashboard**: Roster management for channel moderators and unban controls.

### 🛡️ Security & Bot Mitigation
* **Zero Hardcoded Secrets**: First-user bootstrap automatically designates the first registered user as **Admin**; subsequent accounts are viewers.
* **Dynamic SVG CAPTCHA**: Native algorithmic SVG generator (`/captcha.svg`) with character rotation, noise circles, and wavy distortion lines.
* **Honeypot Trap**: Invisible form trap fields catch and reject automated spam bots before processing.
* **Live Username Validation**: Real-time debounce endpoint (`/check-login`) checks handle availability without page reloads.

---

## 🎨 Color Palette & Design System

LuminaTube features a custom-engineered UI that breaks away from conventional generic templates, using deep oceanic midnight tones paired with sharp cobalt and neon cyan accents:

| Token | Hex Code | Visual Swatch | UI Application |
| :--- | :---: | :---: | :--- |
| **Main Background** | `#0B0F19` | ![#0B0F19](https://img.shields.io/badge/-%230B0F19-0B0F19?style=flat-square) | Deepest midnight navy page foundation |
| **Surface / Card** | `#161E2E` | ![#161E2E](https://img.shields.io/badge/-%23161E2E-161E2E?style=flat-square) | Container background for video cards, sidebars & chat |
| **Borders / Dividers** | `#1E293B` | ![#1E293B](https://img.shields.io/badge/-%231E293B-1E293B?style=flat-square) | Subtle line dividers, search borders, separators |
| **Primary Brand** | `#0047AB` | ![#0047AB](https://img.shields.io/badge/-%230047AB-0047AB?style=flat-square) | Cobalt Blue brand mark, primary buttons, subscribe actions |
| **Interactive Accent**| `#3B82F6` | ![#3B82F6](https://img.shields.io/badge/-%233B82F6-3B82F6?style=flat-square) | Electric Blue active tabs, hover states, toggles |
| **Neon Highlight** | `#60A5FA` | ![#60A5FA](https://img.shields.io/badge/-%2360A5FA-60A5FA?style=flat-square) | Badges, view-count emphasis, active glowing accents |
| **Cyan Highlight** | `#A0D6FF` | ![#A0D6FF](https://img.shields.io/badge/-%23A0D6FF-A0D6FF?style=flat-square) | Secondary accents, subtle pill highlights |
| **Primary Text** | `#F1F5F9` | ![#F1F5F9](https://img.shields.io/badge/-%23F1F5F9-F1F5F9?style=flat-square) | High-contrast readable typography for titles and headers |
| **Muted Text** | `#94A3B8` | ![#94A3B8](https://img.shields.io/badge/-%2394A3B8-94A3B8?style=flat-square) | Metadata, timestamps, follower counts, descriptions |

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have **Node.js 20+** installed (Node v22+ and v26+ with built-in `node:sqlite` recommended):
```bash
node -v
npm -v
```

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/Safiyyulloh01/LuminaTube.git
cd LuminaTube
npm install
```

### 3. Environment Variables (Optional)
Configure an optional `.env` file or export environment variables:
```env
PORT=3000
SESSION_SECRET=your_custom_secure_secret_here
SITE_NAME=LuminaTube
```

### 4. Launch Server
```bash
npm start
```
The application will be live at:
👉 **`http://localhost:3000`**

> 💡 **Initial Setup**: The very first user account created via `/register` will automatically receive the **Administrator (`admin`)** role with full access to `/admin` and all creator tools.

---

## 🌐 Connecting a Custom Domain & Production Setup

To run LuminaTube on a public domain (e.g., `https://yourdomain.com` or `https://stream.yourdomain.com`) with automated SSL and 24/7 uptime, follow this production guide:

### Step 1: Point Your DNS Records
Go to your domain registrar (Cloudflare, Namecheap, GoDaddy, etc.) and add an **A Record**:

| Type | Host / Name | Value / IP | TTL |
| :--- | :--- | :--- | :--- |
| `A` | `@` (or subdomain like `stream`) | `YOUR_SERVER_PUBLIC_IP` | Auto / 1 min |
| `A` | `www` (optional) | `YOUR_SERVER_PUBLIC_IP` | Auto / 1 min |

---

### Step 2: Keep the App Running 24/7 with PM2
Use **PM2** process manager so LuminaTube automatically starts on server reboots and recovers from any crashes:

```bash
# Install PM2 globally
npm install -g pm2

# Start LuminaTube in the background
pm2 start server.js --name "luminatube"

# Configure PM2 to launch on system boot
pm2 startup
pm2 save
```

Useful PM2 commands:
* `pm2 status` — Check server status
* `pm2 logs luminatube` — View live application logs
* `pm2 restart luminatube` — Restart the server

---

### Step 3: Configure Nginx as Reverse Proxy
Install and configure **Nginx** to forward incoming HTTPS traffic and WebSockets to LuminaTube:

```bash
sudo apt update
sudo apt install nginx -y
```

Create an Nginx configuration file for your domain:
```bash
sudo nano /etc/nginx/sites-available/luminatube
```

Paste the following production configuration (replace `yourdomain.com` with your actual domain):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Allow large video file uploads (up to 500 MB)
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket support (essential for Socket.IO live chat)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward real visitor IP and protocol headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for persistent live chat connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable the configuration and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/luminatube /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### Step 4: Secure with Free SSL Certificate (HTTPS)
Use **Certbot (Let's Encrypt)** to obtain a free SSL certificate with automatic 90-day renewal:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain and install SSL automatically
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Select the option to automatically redirect all HTTP traffic to **HTTPS**.

Your site is now securely available globally at:
🔒 **`https://yourdomain.com`**

---

## 📡 Broadcasting via OBS Studio

1. Open **LuminaTube Studio** at `https://yourdomain.com/studio`.
2. Navigate to the **Efir sozlamalari** (*Stream Settings*) tab.
3. Reveal your private **Stream Key** (`live_xxxxxxxxxx`).
4. In **OBS Studio**:
   * Go to **Settings** ➔ **Stream**.
   * Set **Service** to `Custom...`.
   * **Server**: `rtmp://<YOUR_SERVER_IP>:1935/live`
   * **Stream Key**: Paste your private key.
5. Click **Start Streaming** — your stream will immediately appear on the Home Feed and Watch page.

---

## 📂 Architecture

```
LuminaTube/
├── public/                 # Static assets & media
│   ├── static/css/         # style.css, ui-fix.css, watch-mobile.css
│   ├── static/js/          # app.js, studio.js, watch.js, sub.js, hls.min.js
│   ├── img/                # favicon.svg, no-avatar.svg, no-thumb.svg
│   ├── uploads/            # Avatars & custom thumbnails
│   └── vod/                # Video recordings & uploaded media
├── views/                  # EJS template views
│   ├── partials/           # header.ejs, sidebar.ejs
│   ├── index.ejs           # Home feed (Live & VODs)
│   ├── watch.ejs           # Player, Live Chat, Comments
│   ├── studio.ejs          # Creator dashboard (Upload, RTMP, Mod list)
│   ├── channel.ejs         # Public channel portfolio
│   ├── subs.ejs            # Subscriptions feed
│   ├── settings.ejs        # Security & password settings
│   ├── admin.ejs           # Platform administrator panel
│   ├── login.ejs           # Authentication
│   └── register.ejs        # Registration with SVG CAPTCHA
├── db.js                   # High-speed native SQLite database schema
├── socket.js               # Real-time WebSocket engine (Socket.IO)
├── captcha.js              # Algorithmic SVG CAPTCHA engine
└── server.js               # Express application entrypoint
```

---

## 🔌 API & WebSocket Events

### REST Endpoints
| Method | Route | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/check-login` | Public | Real-time username availability check |
| `GET` | `/captcha.svg` | Public | Generates dynamic distorted SVG captcha |
| `POST` | `/api/like/:id` | Auth | Toggle like on stream / video |
| `POST` | `/api/sub/:channelId` | Auth | Subscribe / unsubscribe to creator |
| `POST` | `/api/comment/:id` | Auth | Post a comment under a broadcast |
| `DELETE` | `/api/comment/:id` | Auth | Delete comment (Author or Moderator) |
| `POST` | `/api/studio/upload` | Streamer | Direct MP4/WebM video upload |
| `POST` | `/api/studio/next` | Streamer | Update upcoming broadcast metadata |
| `POST` | `/api/studio/resetkey`| Streamer | Generate new private RTMP key |
| `POST` | `/admin/role` | Admin | Change user role (`viewer`, `streamer`, `admin`) |

### Socket.IO Real-Time Events
| Event Name | Direction | Payload / Purpose |
| :--- | :--- | :--- |
| `join` | Client ➔ Server | Join stream room (`streamId`) |
| `init` | Server ➔ Client | Initial payload (`messages`, `pinned`, `slowMode`, `viewers`) |
| `msg` | Bidirectional | Live chat text delivery with role badge |
| `mod:timeout`| Client ➔ Server | Restrict chatter for `seconds` (300s, 3600s) |
| `mod:ban` | Client ➔ Server | Permanently ban user from stream chat |
| `mod:pin` | Client ➔ Server | Pin or unpin highlight message in room header |
| `mod:delete` | Client ➔ Server | Delete abusive message across all room clients |
| `viewers` | Server ➔ Client | Broadcast synchronized active viewer count |

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).

<div align="center">
  <sub>Built with ❤️ for decentralized, independent creator communities.</sub>
</div>
