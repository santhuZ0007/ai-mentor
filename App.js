// client/src/App.js
import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import './App.css';
import Editor from '@monaco-editor/react';

const socket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:4000', {
  autoConnect: true,
});

// --- AIMentor Component ---
function AIMentor({ socket, setModelData }) {
  const [mentorMessage, setMentorMessage] = useState('Awaiting mentor response...');
  const [query, setQuery] = useState('');

  const sendMentorQuery = () => {
    socket.emit('mentor_query', { query });
  };

  useEffect(() => {
    const handleMentorResponse = (data) => {
      setMentorMessage(data.guidance);
      setModelData(data.modelData);
    };

    socket.on('mentor_response', handleMentorResponse);
    return () => socket.off('mentor_response', handleMentorResponse);
  }, [socket, setModelData]);

  return (
    <div className="pane-content">
      <h2>AI Mentor</h2>
      <div className="message-box">
        {mentorMessage}
      </div>
      <div className="input-group">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe your application or ask a question..."
        />
        <button onClick={sendMentorQuery}>
          Ask Mentor
        </button>
      </div>
    </div>
  );
}

// --- ExecutionPane Component ---
function ExecutionPane({ socket }) {
  const [domain, setDomain] = useState('coding');
  const [code, setCode] = useState('// type your code here');
  const [result, setResult] = useState('');

  const runCode = () => {
    socket.emit('execute_code', { code });
  };

  useEffect(() => {
    const handleExecutionResult = (data) => {
      setResult(data.result);
    };

    socket.on('execution_result', handleExecutionResult);
    return () => socket.off('execution_result', handleExecutionResult);
  }, [socket]);

  return (
    <div className="pane-content">
      <h2>Execution Pane</h2>
      <div className="domain-selector">
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="coding">Coding</option>
          <option value="math">Mathematics</option>
          <option value="design">Design</option>
        </select>
      </div>
      {domain === 'coding' ? (
        <div className="coding-pane">
          <Editor
            height="300px"
            defaultLanguage="HTML"
            value={code}
            onChange={setCode}
            options={{ minimap: { enabled: false } }}
          />
          <button className="run-button" onClick={runCode}>
            Run Code
          </button>
          {result && (
            <div className="result-box">
              <strong>Result:</strong>
              <pre>{result}</pre>
            </div>
          )}
        </div>
      ) : (
        <div className="domain-placeholder">
          {`${domain} domain integration coming soon`}
        </div>
      )}
    </div>
  );
}

// --- CADViewer Component ---
function CADViewer({ modelData }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const meshRef = useRef(null);
  const frameRef = useRef(null);

  // Three.js initialization
  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Renderer setup
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current.setSize(width, height);
    rendererRef.current.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(rendererRef.current.domElement);

    // Camera setup
    cameraRef.current = new THREE.PerspectiveCamera(75, width/height, 0.1, 1000);
    cameraRef.current.position.z = 5;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0x404040);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    sceneRef.current.add(ambientLight, directionalLight);

    // Resize handler
    const handleResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      cameraRef.current.aspect = width/height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      mount.removeChild(rendererRef.current.domElement);
      rendererRef.current.dispose();
    };
  }, []);

  // Model update handler
  useEffect(() => {
    if (!modelData) return;

    // Clear previous mesh
    if (meshRef.current) {
      sceneRef.current.remove(meshRef.current);
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(modelData.vertices, 3)
    );
    geometry.setIndex(modelData.indices);
    geometry.computeVertexNormals();

    // Create material
    const material = new THREE.MeshPhongMaterial({
      color: 0x2194ce,
      shininess: 100,
      side: THREE.DoubleSide
    });

    // Create mesh
    meshRef.current = new THREE.Mesh(geometry, material);
    sceneRef.current.add(meshRef.current);

    // Adjust camera
    const bbox = new THREE.Box3().setFromObject(meshRef.current);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    
    cameraRef.current.position.copy(center);
    cameraRef.current.position.z = size.length() * 2;
    cameraRef.current.lookAt(center);

    // Animation loop
    const animate = () => {
      if (meshRef.current) {
        meshRef.current.rotation.y += 0.005;
      }
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [modelData]);

  return (
    <div className="pane-content">
      <h2>3D Visualization</h2>
      <div ref={mountRef} className="cad-container" />
    </div>
  );
}

// --- Main App Component ---
function App() {
  const [modelData, setModelData] = useState(null);

  return (
    <div className="dashboard-container">
      <div className="pane">
        <AIMentor socket={socket} setModelData={setModelData} />
      </div>
      <div className="pane">
        <ExecutionPane socket={socket} />
      </div>
      <div className="pane">
        <CADViewer modelData={modelData} />
      </div>
    </div>
  );
}

export default App;