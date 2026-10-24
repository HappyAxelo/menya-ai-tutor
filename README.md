# 🦉 Menya — AI Tutor

A high-intelligence academic tutoring platform that **never gives direct answers** — it guides undergraduate students to discover knowledge through structured Socratic reasoning.

Powered by [Claude](https://anthropic.com) (Anthropic). Built with React + Vite. Deployable to GitHub Pages in under 5 minutes.

![Menya Screenshot](https://via.placeholder.com/900x500/020817/7dd3fc?text=Menya+AI+Tutor)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🧠 Socratic Dialogue Engine | Claude is guardrailed to ask guiding questions, never reveal answers |
| 🗺️ Reasoning Graph | Live tracker of concepts, formulas, and logic steps the student discovers |
| ⚠️ Misconception Detection | Detects and redirects common conceptual errors across EE, Math, Physics, CS |
| 📊 Concept Mastery Model | Progress bars across 10 topics, updated in real time |
| 💡 3-Level Hint System | Concept → Formula → Method hints, never the final answer |
| 📈 Learning Analytics | Messages, hints used, concepts identified, misconceptions caught |
| 🔒 Bring Your Own Key | No backend required — API key stays in memory only |

---

## 🚀 Deploy to GitHub Pages (5 minutes)

### Prerequisites
- Node.js 18+ installed
- A GitHub account
- An [Anthropic API key](https://console.anthropic.com)

---

### Step 1 — Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
npm install
```

---

### Step 2 — Set your repo name in Vite config

Open `vite.config.js` and change the `base` to match your GitHub repo name:

```js
// vite.config.js
export default defineConfig({
  plugins: [react()],
  base: '/YOUR_REPO_NAME/',   // ← change this
})
```

> **Exception:** If you're deploying to `YOUR_USERNAME.github.io` (a user/org page), set `base: '/'` instead.

---

### Step 3 — Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

---

### Step 4 — Deploy

```bash
npm run deploy
```

This runs `vite build` and pushes the `dist/` folder to a `gh-pages` branch automatically.

---

### Step 5 — Enable GitHub Pages

1. Go to your repo on GitHub
2. **Settings → Pages**
3. Under **Source**, select **Deploy from a branch**
4. Branch: `gh-pages` / folder: `/ (root)`
5. Click **Save**

Your site will be live at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

(GitHub usually takes 1–2 minutes to go live the first time.)

---

## 🖥️ Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 🔑 API Key Security

Menya uses a **Bring Your Own Key** model:

- Users paste their Anthropic API key into the in-app modal on first load
- The key is **held in React state (memory) only**
- It is **never stored** in localStorage, cookies, or any database
- It is **never sent anywhere** except directly to `api.anthropic.com`
- Refreshing the page clears it completely

This makes the app safe to open-source with zero risk of key exposure.

**Cost:** Claude Sonnet API calls are ~$0.003 per tutoring exchange. A full study session of 30 exchanges costs roughly $0.09.

---

## 🧑‍🏫 How it works

The tutor logic lives in `menya/src/tutor.js` (prompt, response schema, Groq call):

1. **Model:** Groq `openai/gpt-oss-120b`. It reasons privately before answering (`include_reasoning: false`, so the reasoning never reaches the browser), which lets it solve the problem itself and give hints that are actually correct.
2. **Any language:** Menya replies in the language of the student's last message (Kinyarwanda, French, Kiswahili, English, and others). You can also pick a language from the header. Maths notation stays universal.
3. **Accurate hints, never the answer:** the model checks the student's steps against its own verified solution. It confirms correct work, flags wrong work without revealing the value, and never states the final result.
4. **3-level hints:** Concept (names the exact principle) → Relationship (the formula, with the student's quantities mapped onto it) → Next step (set up with values, stopping before the result). **New problem** resets the hint budget.
5. **Structured output:** strict JSON schema, with one retry on malformed output.

### Testing the tutor

```bash
cd menya
GROQ_API_KEY=gsk_... npm run eval
```

This plays scripted conversations in English, French, Kinyarwanda, Kiswahili and Spanish. It checks the reply language, that the final answer never leaks, and that wrong and right answers are judged correctly. It also prints every reply so you can review hint quality.

---

## 📁 Project Structure

```
menya-ai-tutor/
├── src/
│   ├── App.jsx          # Main application (all components + Claude integration)
│   └── main.jsx         # React entry point
├── public/
│   └── owl.svg          # Favicon
├── index.html           # HTML shell
├── vite.config.js       # Vite config (set base here!)
├── package.json         # Dependencies + deploy script
└── README.md
```

---

## 🛠️ Tech Stack

- **Frontend:** React 18, inline styles (no CSS framework dependency)
- **Build:** Vite 5
- **AI:** Anthropic Claude (claude-sonnet-4)
- **Fonts:** Fraunces (display), DM Sans (body), DM Mono (code/data)
- **Deploy:** gh-pages → GitHub Pages

---

## 🔄 Redeploying after changes

```bash
# Make your changes, then:
npm run deploy
```

That's it — build + push to gh-pages in one command.

---

## 📝 Customization

**Change the subject/concept list:**
Edit `INITIAL_MASTERY` in `src/App.jsx` to add your own subjects and concepts.

**Change the tutoring persona:**
Edit `TUTOR_SYSTEM_PROMPT` in `menya/src/tutor.js`. You can adjust tone, subject focus, or add domain-specific misconception examples.

**Change the model:**
Change `MODEL` in `menya/src/tutor.js` to any Groq model ID (strict JSON schema needs a model that supports structured outputs).

---

## 📄 License

MIT — free to use, fork, and deploy. Attribution appreciated.

---

## 🙏 Credits

Built with [Claude](https://anthropic.com) by Anthropic. Inspired by Socratic pedagogy and learning science research on guided discovery, spaced repetition, and metacognitive prompting.
