const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());

// --- THE FIX IS HERE ---
// This tells Express to serve all files inside the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// This tells Express: when someone visits the main link "/", send index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 2. Chat Logic
app.post('/chat', async (req, res) => {
  const userMsg = req.body.message;
  try {
    const dbResult = await pool.query('SELECT * FROM books');
    let libraryContext = "Library Inventory: " + dbResult.rows.map(b => 
      `${b.title} by ${b.author} (${b.status})`
    ).join(", ");

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_KEY}`,
      {
        contents: [{
          parts: [{ text: `You are a school library bot. Context: ${libraryContext}. User: ${userMsg}` }]
        }]
      }
    );

    const botReply = response.data.candidates[0].content.parts[0].text;
    await pool.query('INSERT INTO chat_context (user_query, bot_response) VALUES ($1, $2)', [userMsg, botReply]);

    res.json({ reply: botReply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Database/API Error. Check Render Logs." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
