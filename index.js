// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const axios = require('axios');
const { VM } = require('vm2');
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  }
});

// ================== Configuration ==================
console.log('ENV DEBUG:');
console.log('Gemini Key Exists:', !!process.env.GEMINI_API_KEY);
console.log('Key Starts With:', process.env.GEMINI_API_KEY?.substring(0, 6) || 'N/A');

// ================== Gemini Setup ==================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 2048,
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ================== CAD API Integration ==================
async function callZooCAD(prompt) {
  try {
    const response = await axios.post(
      process.env.ZOO_CAD_API_URL,
      {
        prompt,
        parameters: {
          resolution: "high",
          format: "vertices-indices",
          units: "mm"
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.ZOO_CAD_API_KEY}`,
          'X-API-Version': '2023-12-01'
        },
        timeout: 15000
      }
    );

    if (!response.data?.model?.mesh?.vertices) {
      throw new Error('Invalid CAD response format');
    }

    return {
      vertices: response.data.model.mesh.vertices.flat(),
      indices: response.data.model.mesh.faces.flat()
    };
  } catch (error) {
    console.error('CAD API Error:', error.response?.data || error.message);
    return null;
  }
}

// ================== AI Processing ==================
// server/index.js
async function callGemini(query) {
  try {
    const instruction = `Act as a technical educator. First explain the concept clearly, then provide a CAD generation prompt using this format:
    CAD_PROMPT: [Detailed description of a 3D model that visualizes key components from your explanation]
    
    User Query: ${query}`;

    const chat = model.startChat({ generationConfig, safetySettings });
    const result = await chat.sendMessage(instruction);
    const response = await result.response.text();

    // Improved parsing
    const cadSection = response.match(/CAD_PROMPT:\s*(.+)/i);
    
    return {
      guidance: response.replace(/CAD_PROMPT:.+/i, '').trim(),
      cadPrompt: cadSection?.[1] || `3D model showing: ${query}`
    };
  } catch (error) {
    console.error('Gemini Error:', error);
    return {
      guidance: "I'm having trouble visualizing that. Let me try again...",
      cadPrompt: `Educational model for: ${query}`
    };
  }
}

// ================== Execution Sandbox ==================
const codeVm = new VM({
  timeout: 2000,
  sandbox: {},
  compiler: 'javascript',
  eval: false
});

// ================== Socket.IO Handlers ==================
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('mentor_query', async ({ query }) => {
    try {
      const { guidance, cadPrompt } = await callGemini(query);
      const cadData = process.env.USE_REAL_CAD === 'true' 
        ? await callZooCAD(cadPrompt) 
        : mockCadData();

      socket.emit('mentor_response', {
        guidance,
        modelData: cadData || mockCadData()
      });
    } catch (error) {
      socket.emit('mentor_response', {
        guidance: "System error. Please try again later.",
        modelData: mockCadData()
      });
    }
  });

  socket.on('execute_code', async ({ code }) => {
    try {
      if (/(process|require|import)/gi.test(code)) {
        throw new Error('Restricted keywords detected');
      }

      const result = await codeVm.run(code);
      socket.emit('execution_result', {
        result: typeof result === 'object' 
          ? JSON.stringify(result, null, 2) 
          : result.toString()
      });
    } catch (error) {
      socket.emit('execution_result', {
        result: `Execution Error: ${error.message}`
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ================== Helpers ==================
function mockCadData(prompt) {
  // Educational models database
  const models = {
    "camera": {
      vertices: [/* Detailed camera components */],
      indices: [/* Faces for camera model */]
    },
    "transistor": {
      vertices: [/* PN junction details */],
      indices: [/* Transistor structure */]
    }
  };

  // Find matching educational model
  const key = Object.keys(models).find(k => 
    prompt.toLowerCase().includes(k)
  );

  return key ? models[key] : {
    vertices: [-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1],
    indices: [0,1,2, 0,2,3]
  };
}

// ================== Server Startup ==================
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔑 Gemini Key: ${process.env.GEMINI_API_KEY ? 'Loaded' : 'MISSING!'}`);
  console.log(`🦓 CAD Mode: ${process.env.USE_REAL_CAD === 'true' ? 'REAL' : 'MOCK'}`);
});