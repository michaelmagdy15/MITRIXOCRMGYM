---
name: whatsapp-chat-dodo-1
description: "A WhatsApp chat export dataset containing a log of messages between Michael Mitry and Dodo from 2024 to 2025."
risk: low
source: user
date_added: "2026-06-10"
---

# WhatsApp Chat - Dodo (1)

## 1️⃣ Purpose & Scope
- **Overview**: This project directory acts as a raw dataset folder containing a WhatsApp chat history export. The chat logs the personal conversation between Michael Mitry (also known as Mi5a / Mickey) and Dodo (Sandra).
- **Timeframe**: The messages span from October 2024 through late 2025.
- **Use Cases**: 
  - Sentiment analysis and interaction pattern extraction.
  - Training personal conversational LLMs or chatbots to mimic the tone, style, and vocabulary of the participants.
  - Analyzing text messaging dynamics, relationship timelines, and mixed-language communication patterns (English, Arabic, and Franco-Arabic).

## 2️⃣ Technology Stack & Dependencies
- **Core format**: Plain text (`.txt` UTF-8 file).
- **Dependencies**: None. The directory consists exclusively of a raw text log file without any source code, libraries, or build configurations.
- **Parsing/Analysis Stack (Recommended)**:
  - Language: Python (using `re` for regular expressions, `datetime` for timestamp parsing).
  - Libraries: `pandas` (for structuring the text log into a DataFrame of timestamp, sender, and message content) or `nltk` / `spaCy` (for natural language processing).

## 3️⃣ Project Structure & Key Files
The directory contains a single flat text log file:

| File Path | Purpose / Description | Key Symbols (Classes, Functions, Constants) |
| --- | --- | --- |
| `_chat.txt` | The complete chat log file with 142,721 lines of exported messaging history. | Raw text content |

## 4️⃣ Setup, Commands & Scripts
Since the project contains only a raw text database file, there are no built-in commands or dependency installers:
- **Installation**: N/A
- **Running locally**: N/A (Can be opened in any text editor or ingested via standard file reading interfaces).
- **Testing**: N/A
- **Environmental Configuration**: No `.env` files or configuration schemas are required.

## 5️⃣ Architecture & Key Workflows
### Log Format
Each line in `_chat.txt` typically follows the standard iOS/Android WhatsApp text export format:
`[DD/MM/YYYY, H:MM:SS PM] Name: Message`

Examples:
- `[30/10/2024, 10:54:41 PM] Dodo: Ana f fourth year now`
- `[30/10/2024, 10:55:07 PM] Dodo: Fa from one side haneit gedan`

### Special Patterns & System Indicators
- **Media Attachments**: The text logs omit large attachments but reference them as placeholders:
  - `‎sticker omitted`
  - `‎audio omitted`
  - `‎image omitted`
  - `‎video omitted`
- **System Events**:
  - `Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.`
- **Message Modifications**:
  - `‎<This message was edited>`
  - `‎You deleted this message.`

### Language & Vocabulary Characteristics
- **Bilingualism**: High usage of mixed English and Arabic.
- **Franco-Arabic (Arabizi)**: Extensive use of Latin characters and numbers representing Arabic phonetics (e.g., *khalasty*, *gam3a*, *lesaa*, *bgad*, *mashofnash*).

## 6️⃣ Limitations & Constraints
- **Omitted Media**: Raw images, videos, stickers, and audio files were not exported and are marked as omitted in the text log.
- **File Size**: At ~8.2 MB and 142,721 lines, the file cannot be fed directly into standard LLM prompts in its entirety without exceeding context window constraints or incurring high token costs. Chunking or targeted search strategies are necessary.
- **Formatting Variability**: Multiline messages display as newlines without timestamps, requiring a stateful parser that appends timestamp-less lines to the preceding message.
