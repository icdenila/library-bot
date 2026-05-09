const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- AUTO-INITIALIZE DATABASE ---
const initDb = async () => {
  try {
    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS books (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL, 
        author TEXT, 
        status TEXT DEFAULT 'Available'
      );
      CREATE TABLE IF NOT EXISTS chat_context (
        id SERIAL PRIMARY KEY,
        user_query TEXT, 
        bot_response TEXT, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Seed with starter books if table is empty
    const check = await pool.query('SELECT COUNT(*) FROM books');
    if (parseInt(check.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO books (title, author) VALUES 
        ('The Great Gatsby', 'F. Scott Fitzgerald'),
        ('Clean Code', 'Robert Martin'),
        ('Introduction to Node.js', 'Ryan Dahl');
      `);
      console.log("Database seeded with starter books.");
    }
    console.log("Database initialized successfully!");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
};
initDb();

// 2. Chat Logic
app.post('/chat', async (req, res) => {
  const userMsg = req.body.message;
  try {
    // Fetch current books for AI context
    const dbResult = await pool.query('SELECT * FROM books');
    let libraryContext = "Library Inventory: " + dbResult.rows.map(b => 
      `${b.title} by ${b.author} (${b.status})`
    ).join(", ");

   // Replace the existing URL in server.js with this one:
const response = await axios.post(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_KEY}`,
  {
    contents: [{
      parts: [{ text: `You are a school library bot. Context: ${libraryContext}. User: ${userMsg}` }]
    }]
  }
);

    const botReply = response.data.candidates[0].content.parts[0].text;
    
    // Save chat history
    await pool.query('INSERT INTO chat_context (user_query, bot_response) VALUES ($1, $2)', [userMsg, botReply]);

    res.json({ reply: botReply });
  } catch (err) {
    console.error("Error details:", err.response ? err.response.data : err.message);
    res.status(500).json({ reply: "Database/API Error. Check Render Logs." });
  }
});

const PORT = process.env.PORT || 3000;
// Listen on 0.0.0.0 to help Render's health check
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
