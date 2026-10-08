# 🦊 Fox House AI

### AI-Powered Real Estate Search Assistant

Fox House AI is a personal AI assistant developed to simplify real estate searches in Bulgaria.

The project combines a local large language model, a Telegram bot, and property data imported from Google Sheets and Excel files stored on Google Drive.

The assistant helps find relevant apartments based on natural-language requests.

## ✨ Features

- 🤖 AI-powered property search using natural language
- 🏠 Search by location, budget, and apartment characteristics
- 📊 Property data imported from Google Sheets and Excel
- 🔄 Data normalization, cleaning, and duplicate removal
- 📸 Links to property photos and original price lists
- 💬 Telegram bot interface
- 📋 Paginated search results
- 🔒 Local AI processing with Ollama

## 🛠 Tech Stack

| Technology | Purpose |
|---|---|
| JavaScript / Node.js | Backend and application logic |
| Ollama | Local AI model runtime |
| Qwen | Large language model |
| Telegram Bot API / Telegraf | Telegram interface |
| Google Drive API | Access to property files |
| Google Sheets API | Spreadsheet data integration |
| ExcelJS | Excel file processing |
| Git & GitHub | Version control |

## 🏗 Architecture

```text
Google Sheets + Google Drive / Excel
                  |
                  v
          Data Import System
                  |
                  v
       Cleaning & Normalization
                  |
                  v
          Local Property Database
                  |
                  v
           AI Search Engine
                  |
                  v
             Telegram Bot
                  |
                  v
            Search Results
```

## 📊 Current Project Status

The current development dataset contains approximately **1,586 property records**, imported from **30 data sources**.

The system supports real estate searches through Telegram and returns property details such as prices, areas, residential complexes, agencies, and available source links.

Development is ongoing, with a focus on improving search accuracy and simplifying data updates.

## 🚀 Getting Started

### Requirements

- Node.js
- Ollama
- A locally available Qwen model
- Telegram bot credentials
- Google API credentials and appropriate access permissions

### Installation

Clone the repository:

```bash
git clone https://github.com/AlisaChu/fox-house-ai..git
cd fox-house-ai.
npm install
```

Configure your local environment variables and Google authentication files before running the application.

Sensitive credentials and private property data are intentionally excluded from this repository.

## 🔐 Security

This repository does not intentionally include:

- Telegram bot tokens
- Google authentication credentials
- Local environment files
- Private property databases
- Agency-specific price overrides

Access to Google Drive and Google Sheets requires separate authorization.

## 🎯 Project Goals

Fox House AI is designed as a personal productivity tool for real estate work.

The goal is to reduce time spent searching multiple property lists and provide a single conversational interface for finding suitable apartments.

Future improvements include more accurate property matching, automated data synchronization, and improved availability tracking.

## 👩‍💻 Development

Developed as an independent AI and real estate automation project for **Fox House Property**, Bulgaria.

---

**Fox House AI — Smarter Property Search, Powered by AI.**