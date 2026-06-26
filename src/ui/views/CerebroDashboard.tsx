// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Brain, 
  Cpu, 
  Sliders, 
  Terminal, 
  MessageSquare, 
  Send, 
  Wrench, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Play, 
  RefreshCw, 
  Compass, 
  TrendingUp, 
  Zap, 
  Settings, 
  CheckCircle, 
  AlertTriangle 
} from 'lucide-react';

// ==========================================
// CONFIGURATION & GLOBAL VARIABLES
// ==========================================
const appId = typeof __app_id !== 'undefined' ? __app_id : 'cerebro-bci-dashboard';

export function CerebroDashboard() {
  // --- STATE MANAGEMENT ---
  const [apiKey, setApiKey] = useState('');
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('telemetry');
  
  // Interactive Telemetry Values
  const [telemetry, setTelemetry] = useState({
    focusIndex: 84,
    cognitiveLoad: 42,
    synapticEfficiency: 96,
    neuralAsymmetry: 2.1,
    heartRate: 68,
    hemoFlow: 100
  });

  // Neural Frequency Tuning (Hz & Power)
  const [frequencies, setFrequencies] = useState({
    delta: { freq: 2.5, amplitude: 15 },  // Sleep / Deep repair (0.5 - 4 Hz)
    theta: { freq: 6.2, amplitude: 30 },  // Creativity / Flow (4 - 8 Hz)
    alpha: { freq: 10.5, amplitude: 75 }, // Relaxed Focus / Peak State (8 - 12 Hz)
    beta: { freq: 18.2, amplitude: 45 },  // Active thinking / Processing (12 - 30 Hz)
    gamma: { freq: 40.0, amplitude: 25 }   // High-level integration (30 - 100 Hz)
  });

  // System States
  const [selectedNode, setSelectedNode] = useState(null);
  const [alignmentActive, setAlignmentActive] = useState(false);
  const [alignmentProgress, setAlignmentProgress] = useState(100);
  const [logs, setLogs] = useState([
    { id: 1, time: '13:30:02', type: 'system', text: 'CerebrO BCI Core initialized successfully.' },
    { id: 2, time: '13:30:05', type: 'info', text: 'Calibrated Golden Neural Node Array.' },
    { id: 3, time: '13:30:10', type: 'success', text: 'Blue Wrench diagnostic overlay online.' }
  ]);

  // AI Chat States
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Welcome, Billie. I am CerebrO, your neural integration companion. Telemetry indicates your Prefrontal Alpha levels are beautifully synchronized. Would you like to execute a mental focus alignment or scan your temporal lobe diagnostics?"
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [groundingEnabled, setGroundingEnabled] = useState(false);
  const [sources, setSources] = useState([]);

  // TTS Voice Settings
  const [voiceName, setVoiceName] = useState('Kore');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);

  // --- REFS FOR VISUALIZATIONS ---
  const canvasRef3D = useRef(null);
  const waveCanvasRef = useRef(null);

  // --- LOG WRITER HELPERS ---
  const addLog = (text, type = 'info') => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    setLogs(prev => [
      { id: Date.now(), time: timeStr, type, text },
      ...prev.slice(0, 49) // Keep last 50 logs
    ]);
  };

  // ==========================================
  // REAL-TIME OSCILLOSCOPE (WAVE CANVAS)
  // ==========================================
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let t = 0;

    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = 120;
    };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      ctx.fillStyle = 'rgba(5, 5, 10, 0.2)'; // Faint trails
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw faint baseline grid
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < canvas.height; i += 20) {
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
      }
      ctx.stroke();

      // Synthesize composite waveform
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#F59E0B'; // Gold primarily, or shifting to Blue

      // Gradient for beautiful wave visualization
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, '#3B82F6'); // Blue start
      gradient.addColorStop(0.5, '#F59E0B'); // Gold mid
      gradient.addColorStop(1, '#3B82F6'); // Blue end
      ctx.strokeStyle = gradient;

      for (let x = 0; x < canvas.width; x++) {
        let y = canvas.height / 2;

        // Add contributions of all brainwave bands
        Object.keys(frequencies).forEach(key => {
          const { freq, amplitude } = frequencies[key];
          // Scale waves for display
          y += Math.sin((x * 0.05 * freq) + t) * (amplitude * 0.3);
        });

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      t += 0.05;
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [frequencies]);

  // ==========================================
  // INTERACTIVE 3D NEURAL CANVAS BRAIN
  // ==========================================
  useEffect(() => {
    const canvas = canvasRef3D.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    
    let rotationY = 0;
    let rotationX = 0.3; // Slight tilt downward to show 3D nature
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    // Generate Neural Nodes (Brain structure matching logo style)
    const nodeCount = 85;
    const nodes = [];

    // Form a double-hemisphere ellipsoid structure resembling a human brain
    for (let i = 0; i < nodeCount; i++) {
      // Determine left/right hemisphere
      const isLeft = Math.random() > 0.5;
      const hemisphereOffset = isLeft ? -25 : 25;

      // Brain shapes typically are elongated ellipsoids with wrinkles (sulci)
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI;

      // Ellipsoid radii
      const rx = 65 + Math.random() * 15;
      const ry = 50 + Math.random() * 12;
      const rz = 55 + Math.random() * 15;

      // Mathematical shape resembling the temporal/cerebral lobes
      const base3dX = rx * Math.sin(v) * Math.cos(u) + hemisphereOffset;
      const base3dY = ry * Math.cos(v) * (1.1 - 0.2 * Math.sin(u)); // Lobular look
      const base3dZ = rz * Math.sin(v) * Math.sin(u);

      // Distinguish diagnostic nodes (wrench layout in center)
      // A subset of nodes is marked as 'diagnostic/wrench' pathways (glowing Blue in logo)
      const isDiagnosticPath = i % 8 === 0;

      nodes.push({
        id: i,
        x3d: base3dX,
        y3d: base3dY,
        z3d: base3dZ,
        type: isDiagnosticPath ? 'wrench' : 'neural',
        charge: Math.random() * 2 * Math.PI,
        pulseSpeed: 0.02 + Math.random() * 0.04,
        label: isDiagnosticPath ? `Repair Hub #${i}` : `Node ${i}`,
        signalStrength: Math.floor(70 + Math.random() * 30),
        hemodynamic: (Math.random() * 10).toFixed(1)
      });
    }

    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth || 400;
      canvas.height = canvas.parentElement.clientHeight || 350;
    };
    resize();
    window.addEventListener('resize', resize);

    // Mouse Controls for 3D Camera Angles
    const onMouseDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      rotationY += dx * 0.007;
      rotationX += dy * 0.007;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    // Touch Support
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      rotationY += dx * 0.007;
      rotationX += dy * 0.007;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onMouseUp);

    // Render loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Auto rotation subtle drift if user is not active
      if (!isDragging) {
        rotationY += 0.002;
      }

      // Project 3D nodes to 2D
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);

      const projected = nodes.map(n => {
        // Rotate around Y axis
        let x1 = n.x3d * cosY - n.z3d * sinY;
        let z1 = n.x3d * sinY + n.z3d * cosY;

        // Rotate around X axis
        let y2 = n.y3d * cosX - z1 * sinX;
        let z2 = n.y3d * sinX + z1 * cosX;

        // Perspective projection
        const distance = 250;
        const scale = distance / (distance + z2);
        const screenX = centerX + x1 * scale * 1.5;
        const screenY = centerY + y2 * scale * 1.5;

        // Update node dynamic pulses
        n.charge += n.pulseSpeed;

        return {
          ...n,
          screenX,
          screenY,
          zDepth: z2,
          scale
        };
      });

      // Sort by depth so background things draw first
      projected.sort((a, b) => b.zDepth - a.zDepth);

      // --- DRAW BACKGROUND BRACKETS (Directly inspired by Logo) ---
      const cornerRadius = 24;
      const outerSizeX = Math.min(canvas.width - 20, 360) / 2;
      const outerSizeY = Math.min(canvas.height - 20, 320) / 2;

      ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)'; // Faint blue outer bracket
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Render outer bounding corners mimicking the logo bracket
      // Top Left Corner
      ctx.moveTo(centerX - outerSizeX + 40, centerY - outerSizeY);
      ctx.arcTo(centerX - outerSizeX, centerY - outerSizeY, centerX - outerSizeX, centerY - outerSizeY + 40, cornerRadius);
      // Bottom Left Corner
      ctx.moveTo(centerX - outerSizeX, centerY + outerSizeY - 40);
      ctx.arcTo(centerX - outerSizeX, centerY + outerSizeY, centerX - outerSizeX + 40, centerY + outerSizeY, cornerRadius);
      // Bottom Right Corner
      ctx.moveTo(centerX + outerSizeX - 40, centerY + outerSizeY);
      ctx.arcTo(centerX + outerSizeX, centerY + outerSizeY, centerX + outerSizeX, centerY + outerSizeY - 40, cornerRadius);
      // Top Right Corner
      ctx.moveTo(centerX + outerSizeX, centerY - outerSizeY + 40);
      ctx.arcTo(centerX + outerSizeX, centerY - outerSizeY, centerX + outerSizeX - 40, centerY - outerSizeY, cornerRadius);
      ctx.stroke();

      // --- DRAW WRENCH GEOMETRY OVERLAY IN CENTER (Logo Motif) ---
      // This establishes the alignment focus visually inside the brain
      ctx.save();
      ctx.shadowBlur = alignmentActive ? 25 : 8;
      ctx.shadowColor = '#3B82F6';
      ctx.strokeStyle = alignmentActive ? 'rgba(59, 130, 246, 0.8)' : 'rgba(59, 130, 246, 0.35)';
      ctx.lineWidth = 3.5;
      
      ctx.beginPath();
      // Draw a sleek futuristic line outline of the wrench aligned diagonally
      // Lower shaft start
      const wx1 = centerX - 50;
      const wy1 = centerY + 50;
      // Upper wrench jaw head
      const wx2 = centerX + 40;
      const wy2 = centerY - 40;

      // Let's draw the stylized mechanical wireframe wrench overlay
      // Handle base jaw
      ctx.moveTo(wx1 - 10, wy1 + 10);
      ctx.lineTo(wx1 - 15, wy1 + 5);
      ctx.lineTo(wx1 - 5, wy1 - 15);
      ctx.lineTo(wx1 + 10, wy1 - 10);
      // Shaft connecting
      ctx.lineTo(wx2 - 10, wy2 + 10);
      // Top head jaw
      ctx.lineTo(wx2 - 5, wy2 + 20);
      ctx.lineTo(wx2 + 15, wy2 + 15);
      ctx.lineTo(wx2 + 25, wy2 - 5);
      ctx.lineTo(wx2 + 10, wy2 - 20);
      ctx.lineTo(wx2 - 15, wy2 - 15);
      ctx.lineTo(wx2 - 20, wy2 + 5);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // --- DRAW CONNECTIONS (Neural Pathways) ---
      ctx.lineWidth = 0.5;
      for (let i = 0; i < projected.length; i++) {
        const nodeA = projected[i];
        
        // Find close neighbors to draw pathways
        for (let j = i + 1; j < projected.length; j++) {
          const nodeB = projected[j];
          
          // Calculate 3D Euclidean distance
          const dx = nodeA.x3d - nodeB.x3d;
          const dy = nodeA.y3d - nodeB.y3d;
          const dz = nodeA.z3d - nodeB.z3d;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

          // Standard neural threshold
          if (dist < 48) {
            const alpha = (1 - dist / 48) * 0.28 * nodeA.scale;
            ctx.strokeStyle = nodeA.type === 'wrench' && nodeB.type === 'wrench'
              ? `rgba(59, 130, 246, ${alpha * 2})` // Blue diagnostic pathway
              : `rgba(245, 158, 11, ${alpha})`;  // Golden brain wireframe

            ctx.beginPath();
            ctx.moveTo(nodeA.screenX, nodeA.screenY);
            ctx.lineTo(nodeB.screenX, nodeB.screenY);
            ctx.stroke();
          }
        }
      }

      // --- DRAW NODES ---
      projected.forEach(n => {
        const glowRadius = (Math.sin(n.charge) + 1.2) * 2.5 * n.scale;
        
        // Setup node core styling (Logo inspired gold & blue)
        const isGold = n.type === 'neural';
        const primaryColor = isGold ? '#F59E0B' : '#60A5FA';
        const shadowColor = isGold ? 'rgba(245, 158, 11, 0.7)' : 'rgba(96, 165, 250, 0.8)';
        
        ctx.save();
        ctx.shadowBlur = glowRadius + 4;
        ctx.shadowColor = shadowColor;
        ctx.fillStyle = primaryColor;

        // Render node dot
        ctx.beginPath();
        const baseRadius = isGold ? 2.5 * n.scale : 4 * n.scale;
        ctx.arc(n.screenX, n.screenY, baseRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // If alignment is scanning, overlay extra energy rings on wrench nodes
        if (alignmentActive && n.type === 'wrench') {
          ctx.strokeStyle = '#60A5FA';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(n.screenX, n.screenY, baseRadius * (1.5 + Math.sin(Date.now() * 0.01)), 0, Math.PI * 2);
          ctx.stroke();
        }

        // Keep track of clicked/selected diagnostic nodes
        if (selectedNode && selectedNode.id === n.id) {
          ctx.strokeStyle = '#60A5FA';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(n.screenX, n.screenY, baseRadius + 6, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw minimal hover text
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '10px Courier New';
          ctx.fillText(n.label, n.screenX + 8, n.screenY - 4);
        }
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    // Node click handler
    const handleCanvasClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Project nodes dynamically to identify click target
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);

      let closestNode = null;
      let minDist = 18; // Click radius target size

      nodes.forEach(n => {
        let x1 = n.x3d * cosY - n.z3d * sinY;
        let z1 = n.x3d * sinY + n.z3d * cosY;
        let y2 = n.y3d * cosX - z1 * sinX;
        let z2 = n.y3d * sinX + z1 * cosX;
        const scale = 250 / (250 + z2);
        const screenX = centerX + x1 * scale * 1.5;
        const screenY = centerY + y2 * scale * 1.5;

        const dist = Math.hypot(clickX - screenX, clickY - screenY);
        if (dist < minDist) {
          minDist = dist;
          closestNode = { ...n, screenX, screenY };
        }
      });

      if (closestNode) {
        setSelectedNode(closestNode);
        addLog(`Selected Diagnostic Core: ${closestNode.label} (Strength: ${closestNode.signalStrength}%)`, 'info');
      }
    };

    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onMouseUp);
    };
  }, [alignmentActive, selectedNode]);

  // ==========================================
  // ACTION: REALIGNMENT TUNING ACTION
  // ==========================================
  const triggerAlignment = () => {
    if (alignmentActive) return;
    setAlignmentActive(true);
    setAlignmentProgress(0);
    setSelectedNode(null);
    addLog('Executing "Blue Wrench" Neural Realignment Sequence...', 'info');

    // Incremental progress loop simulating neuro-alignment
    const interval = setInterval(() => {
      setAlignmentProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setAlignmentActive(false);
          setTelemetry(prevTel => ({
            ...prevTel,
            focusIndex: Math.min(100, prevTel.focusIndex + 8),
            cognitiveLoad: Math.max(25, prevTel.cognitiveLoad - 10),
            synapticEfficiency: Math.min(100, prevTel.synapticEfficiency + 4)
          }));
          addLog('Neural alignment optimal. Alpha and Gamma wave ratios secured.', 'success');
          return 100;
        }
        return prev + 5;
      });
    }, 150);
  };

  // ==========================================
  // AI COPILOT: INTEGRATION WITH GEMINI API
  // ==========================================
  const callCerebroCore = async (prompt) => {
    setIsGenerating(true);
    addLog('Querying CerebrO Core Neural Model...', 'info');

    const history = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    // Inject active BCI telemetry context silently to assist the model
    const telemetryContext = `\n\n[Active Telemetry Status: Focus Index: ${telemetry.focusIndex}%, Cognitive Load: ${telemetry.cognitiveLoad}%, Synaptic Efficiency: ${telemetry.synapticEfficiency}%, Frequency Focus: Alpha Peak at ${frequencies.alpha.freq}Hz]. Ensure your response is tailored directly to this telemetry and Billie's neuro-engineering efforts.`;

    const payload = {
      contents: [
        ...history,
        { role: 'user', parts: [{ text: prompt + telemetryContext }] }
      ],
      systemInstruction: {
        parts: [{
          text: `You are CerebrO Core, a high-fidelity diagnostic BCI system and strategic neural co-pilot designed for Billie. You analyze cortical activity, brainwave modulations, and cognitive load telemetry.
Keep responses concise, scientific, and direct. Use markdown formats like lists or key parameters to report findings. Color schemes used on Billie's dashboard are Pitch Black, Glowing Gold (neural pathways), and Glowing Blue (mechanical/diagnostic repairs).`
        }]
      }
    };

    if (groundingEnabled) {
      payload.tools = [{ "google_search": {} }];
    }

    let delay = 1000;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        const result = await response.json();

        const replyText = result.candidates?.[0]?.content?.parts?.[0]?.text || "No diagnostics resolved.";
        
        // Handle Grounding Metadata if enabled
        const searchSources = result.candidates?.[0]?.groundingMetadata?.groundingAttributions?.map(a => ({
          uri: a.web?.uri,
          title: a.web?.title
        })) || [];

        setIsGenerating(false);
        setSources(searchSources);
        return replyText;

      } catch (err) {
        if (attempt === 4) {
          setIsGenerating(false);
          addLog('CerebrO Core API link failure.', 'error');
          return `Error contacting diagnostic engine. Please verify your Gemini API Key in Settings (top right). Current exception: ${err.message}`;
        }
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isGenerating) return;

    const userPrompt = userInput;
    setUserInput('');
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: userPrompt }]);

    const responseText = await callCerebroCore(userPrompt);
    setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: responseText }]);
  };

  const handleQuickPrompt = async (prompt) => {
    if (isGenerating) return;
    setUserInput('');
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: prompt }]);
    const responseText = await callCerebroCore(prompt);
    setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: responseText }]);
  };

  // ==========================================
  // TTS BIOFEEDBACK (TEXT TO SPEECH)
  // ==========================================
  const speakText = async (textToSpeak) => {
    if (isSpeaking) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsSpeaking(false);
      return;
    }

    addLog(`Synthesizing biofeedback audio (${voiceName})...`, 'info');
    setIsSpeaking(true);

    const payload = {
      contents: [{ parts: [{ text: `Say in a balanced, futuristic neural synthesized voice: ${textToSpeak.substring(0, 300)}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName
            }
          }
        }
      },
      model: "gemini-2.5-flash-preview-tts"
    };

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`Audio API request failed`);
      const result = await response.json();

      const pcmBase64 = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;

      if (!pcmBase64) throw new Error("No audio payload returned.");

      // Parse sample rate
      let sampleRate = 24000;
      if (mimeType && mimeType.includes('rate=')) {
        const rateStr = mimeType.split('rate=')[1]?.split(';')[0] || '24000';
        sampleRate = parseInt(rateStr, 10);
      }

      const waveUrl = pcmToWav(pcmBase64, sampleRate);
      setAudioUrl(waveUrl);

      if (audioRef.current) {
        audioRef.current.src = waveUrl;
        audioRef.current.play();
        audioRef.current.onended = () => setIsSpeaking(false);
      }

    } catch (err) {
      setIsSpeaking(false);
      addLog(`Failed to speak audio. Setup API key.`, 'error');
    }
  };

  // Helper PCM converter
  const pcmToWav = (pcmBase64, sampleRate) => {
    const binary = atob(pcmBase64);
    const buffer = new ArrayBuffer(44 + binary.length);
    const view = new DataView(buffer);

    const writeString = (v, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        v.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + binary.length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM Format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // 16 bit
    writeString(view, 36, 'data');
    view.setUint32(40, binary.length, true);

    for (let i = 0; i < binary.length; i++) {
      view.setUint8(44 + i, binary.charCodeAt(i));
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  };

  // Handle manual frequency adjustments with logs
  const handleFreqChange = (band, field, val) => {
    setFrequencies(prev => ({
      ...prev,
      [band]: {
        ...prev[band],
        [field]: parseFloat(val)
      }
    }));
    if (field === 'freq') {
      addLog(`Modified ${band.toUpperCase()} band frequency to ${val} Hz.`, 'info');
    }
  };

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Hidden Audio element for BCI voice synthesis */}
      <audio ref={audioRef} className="hidden" />

      {/* --- PREMIUM HEADER --- */}
      <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md px-6 py-4 sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Customized SVG Icon embodying the uploaded logo motif */}
          <div className="relative h-10 w-10 flex items-center justify-center rounded-xl bg-slate-900 border border-blue-500/30 overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.25)]">
            <svg viewBox="0 0 100 100" className="w-full h-full p-1.5">
              {/* Outer glowing border */}
              <rect x="10" y="10" width="80" height="80" rx="16" fill="none" stroke="#3B82F6" strokeWidth="3" opacity="0.8" />
              {/* Inner golden brain stylized nodes */}
              <circle cx="35" cy="40" r="4" fill="#F59E0B" />
              <circle cx="45" cy="30" r="3.5" fill="#F59E0B" />
              <circle cx="65" cy="40" r="4" fill="#F59E0B" />
              <circle cx="55" cy="55" r="3" fill="#F59E0B" />
              <circle cx="40" cy="65" r="4.5" fill="#F59E0B" />
              <path d="M35,40 L45,30 L65,40 L55,55 L40,65 Z" stroke="#F59E0B" strokeWidth="1" strokeDasharray="2" fill="none" opacity="0.6" />
              {/* Central neon blue wrench */}
              <path d="M25,75 L45,55 M40,50 L55,35 L65,45 L55,55 Z" stroke="#60A5FA" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-blue-400 tracking-widest font-semibold">PROJECT CEREBRO</span>
              <span className="bg-amber-500/10 text-amber-400 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/20 font-mono">BILLIE-EDITION</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-slate-50 via-amber-200 to-blue-400 bg-clip-text text-transparent">
              Neural Tuning Engine
            </h1>
          </div>
        </div>

        {/* Action Controls & Settings API */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowApiSettings(!showApiSettings)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-mono ${
              apiKey 
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
            }`}
          >
            <Settings className="h-4.5 w-4.5" />
            {apiKey ? 'API SECURE' : 'SETUP API KEY'}
          </button>
        </div>
      </header>

      {/* --- API SETTINGS PANEL --- */}
      {showApiSettings && (
        <div className="bg-slate-950 border-b border-slate-900 px-6 py-5 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="max-w-xl text-xs text-slate-400">
            <span className="text-amber-400 font-semibold block mb-1">CerebrO Core Integration API Settings</span>
            Providing a Gemini API Key allows you to have fully responsive brain telemetry diagnostics and synthesize artificial voice reporting directly inside the cockpit. Keys remain secure in memory.
          </div>
          <div className="flex w-full md:w-auto items-center gap-3">
            <input 
              type="password" 
              placeholder="Paste Gemini API Key..." 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-grow md:w-64 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <button 
              onClick={() => {
                setShowApiSettings(false);
                addLog('Gemini BCI key interface configured.', 'success');
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg transition-all font-semibold"
            >
              Connect Core
            </button>
          </div>
        </div>
      )}

      {/* --- MAIN CORE COCKPIT LAYOUT --- */}
      <main className="flex-grow p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ==========================================
            LEFT PANEL: BCI METRIC READOUTS (Cols: 3)
            ========================================== */}
        <section className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Active Biosignals */}
          <div className="bg-slate-950/80 backdrop-blur-md border border-slate-900 rounded-2xl p-4 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <h2 className="text-xs font-bold text-slate-300 tracking-wider flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                BIOTELEMETRY FEED
              </h2>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Focus index */}
              <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3">
                <div className="text-[10px] text-slate-500 font-mono mb-1">FOCUS RATIO</div>
                <div className="text-xl font-mono font-bold text-amber-400">{telemetry.focusIndex}%</div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${telemetry.focusIndex}%` }}
                  ></div>
                </div>
              </div>

              {/* Cognitive load */}
              <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3">
                <div className="text-[10px] text-slate-500 font-mono mb-1">COG. LOAD</div>
                <div className="text-xl font-mono font-bold text-blue-400">{telemetry.cognitiveLoad}%</div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${telemetry.cognitiveLoad}%` }}
                  ></div>
                </div>
              </div>

              {/* Efficiency */}
              <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 col-span-2">
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
                  <span>SYNAPTIC SPEED</span>
                  <span className="text-emerald-400">OPTIMAL</span>
                </div>
                <div className="text-xl font-mono font-bold text-slate-200">{telemetry.synapticEfficiency}%</div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-amber-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${telemetry.synapticEfficiency}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Quick telemetry real-time values */}
            <div className="space-y-2 pt-2 border-t border-slate-900">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-mono">Heart Rate variability</span>
                <span className="font-mono text-slate-300">{telemetry.heartRate} BPM</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-mono">Hemo-Oxygenation flow</span>
                <span className="font-mono text-slate-300">{telemetry.hemoFlow}% V_f</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-mono">Hemispheric Asymmetry</span>
                <span className="font-mono text-slate-300">+{telemetry.neuralAsymmetry} L_h</span>
              </div>
            </div>
          </div>

          {/* Real-time Oscilloscope Waves & Modulators */}
          <div className="bg-slate-950/80 backdrop-blur-md border border-slate-900 rounded-2xl p-4 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <h2 className="text-xs font-bold text-slate-300 tracking-wider flex items-center gap-2">
                <Sliders className="h-4 w-4 text-amber-500" />
                FREQUENCY SPECTRUM
              </h2>
              <span className="text-[10px] font-mono text-blue-400">COMPOSITE LIVE</span>
            </div>

            {/* Simulated Live Waveform */}
            <div className="bg-black/90 border border-slate-900 rounded-xl overflow-hidden relative">
              <canvas ref={waveCanvasRef} className="w-full block" />
              <div className="absolute top-2 left-3 text-[9px] font-mono text-slate-500 tracking-wide">
                EEG WAVEFORM GENERATOR
              </div>
            </div>

            {/* Oscilloscope Frequency Sliders */}
            <div className="space-y-3 pt-2">
              {/* Alpha Modulator */}
              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-amber-400 font-semibold">Alpha Peak (Focus/Flow)</span>
                  <span className="text-slate-400">{frequencies.alpha.freq} Hz</span>
                </div>
                <input 
                  type="range" 
                  min="8" 
                  max="12" 
                  step="0.1"
                  value={frequencies.alpha.freq} 
                  onChange={(e) => handleFreqChange('alpha', 'freq', e.target.value)}
                  className="w-full accent-amber-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                />
              </div>

              {/* Gamma Modulator */}
              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-blue-400 font-semibold">Gamma Power (Integration)</span>
                  <span className="text-slate-400">{frequencies.gamma.freq} Hz</span>
                </div>
                <input 
                  type="range" 
                  min="30" 
                  max="60" 
                  step="0.5"
                  value={frequencies.gamma.freq} 
                  onChange={(e) => handleFreqChange('gamma', 'freq', e.target.value)}
                  className="w-full accent-blue-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                />
              </div>

              {/* Theta Modulator */}
              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-slate-400">Theta Band (Deep Ideas)</span>
                  <span className="text-slate-500">{frequencies.theta.freq} Hz</span>
                </div>
                <input 
                  type="range" 
                  min="4" 
                  max="8" 
                  step="0.1"
                  value={frequencies.theta.freq} 
                  onChange={(e) => handleFreqChange('theta', 'freq', e.target.value)}
                  className="w-full accent-slate-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================
            CENTER PANEL: 3D INTERACTIVE BRAIN (Cols: 5)
            ========================================== */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Main Visualizer Board */}
          <div className="bg-slate-950/80 backdrop-blur-md border border-slate-900 rounded-2xl p-4 flex flex-col justify-between flex-grow shadow-xl min-h-[450px]">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4.5 w-4.5 text-amber-400" />
                <div>
                  <h2 className="text-xs font-bold text-slate-300 tracking-wider">CORTICAL DIAGNOSTIC SCANNER</h2>
                  <p className="text-[10px] text-slate-500">Drag to rotate the 3D projection. Click nodes for telemetry.</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                <span className="text-[10px] font-mono text-slate-400">WRENCH GRID OVERLAY</span>
              </div>
            </div>

            {/* Canvas Interactive Screen */}
            <div className="flex-grow flex items-center justify-center relative overflow-hidden my-4 bg-black/60 rounded-xl border border-slate-900/60">
              <canvas ref={canvasRef3D} className="w-full h-full cursor-grab active:cursor-grabbing" />

              {/* Absolute Overlays for Selected Nodes */}
              {selectedNode && (
                <div className="absolute top-3 left-3 bg-slate-950/95 border border-blue-500/30 rounded-xl p-3 text-xs shadow-2xl backdrop-blur-lg max-w-[180px] font-mono animate-fade-in">
                  <div className="text-blue-400 font-bold border-b border-slate-900 pb-1 mb-2 flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    {selectedNode.label}
                  </div>
                  <div className="space-y-1 text-[10px] text-slate-300">
                    <div>Path: <span className="text-amber-400">{selectedNode.type.toUpperCase()}</span></div>
                    <div>Hemo Flux: <span className="text-slate-100">{selectedNode.hemodynamic} mL</span></div>
                    <div>Voltage Sync: <span className="text-slate-100">{selectedNode.signalStrength}%</span></div>
                  </div>
                  <button 
                    onClick={() => {
                      addLog(`Targeted pulse correction sent to Node #${selectedNode.id}`, 'success');
                      setSelectedNode(null);
                    }}
                    className="w-full mt-2.5 bg-blue-600/30 hover:bg-blue-600 text-blue-200 text-[9px] font-bold py-1 px-1.5 rounded transition-all border border-blue-500/40"
                  >
                    EMIT TUNING IMPULSE
                  </button>
                </div>
              )}

              {/* Progress bar overlay during alignment */}
              {alignmentActive && (
                <div className="absolute inset-0 bg-black/65 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle cx="32" cy="32" r="28" stroke="currentColor" className="text-slate-800" strokeWidth="4" fill="transparent" />
                      <circle cx="32" cy="32" r="28" stroke="currentColor" className="text-blue-500 transition-all duration-300" strokeWidth="4" fill="transparent"
                        strokeDasharray={175}
                        strokeDashoffset={175 - (175 * alignmentProgress) / 100}
                      />
                    </svg>
                    <Wrench className="h-6 w-6 text-blue-400 absolute animate-pulse" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-mono font-bold tracking-widest text-blue-400">ALIGNING NEURAL CORE</div>
                    <div className="text-[10px] font-mono text-slate-500">{alignmentProgress}% calibration completed</div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Trigger Control Board */}
            <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/30">
                  <Wrench className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200">Blue Wrench Re-alignment</div>
                  <div className="text-[10px] text-slate-400">Optimizes cortical hemispheric synchronization</div>
                </div>
              </div>
              <button
                disabled={alignmentActive}
                onClick={triggerAlignment}
                className="w-full md:w-auto px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-slate-800 disabled:to-slate-800 text-slate-100 font-bold rounded-lg text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] flex items-center justify-center gap-2"
              >
                <RefreshCw className={`h-4.5 w-4.5 ${alignmentActive ? 'animate-spin' : ''}`} />
                TRIGGER SYNAPSE ALIGNMENT
              </button>
            </div>
          </div>
        </section>

        {/* ==========================================
            RIGHT PANEL: CEREBRO CORE AI CO-PILOT (Cols: 4)
            ========================================== */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          
          <div className="bg-slate-950/80 backdrop-blur-md border border-slate-900 rounded-2xl p-4 flex flex-col justify-between h-[450px] shadow-xl">
            {/* Header section with voice settings */}
            <div className="border-b border-slate-900 pb-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-300 tracking-wider flex items-center gap-2">
                  <MessageSquare className="h-4.5 w-4.5 text-blue-400" />
                  CEREBRO CORE PILOT
                </h2>
                <div className="flex items-center gap-2">
                  {/* Grounding switch */}
                  <button 
                    onClick={() => {
                      setGroundingEnabled(!groundingEnabled);
                      addLog(`Google Grounding: ${!groundingEnabled ? 'Active' : 'Offline'}`, 'info');
                    }}
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border transition-all ${
                      groundingEnabled 
                        ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' 
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    SEARCH GROUNDING
                  </button>
                </div>
              </div>

              {/* TTS Configuration Toolbar */}
              <div className="flex items-center justify-between text-[11px] bg-slate-900/50 p-2 rounded-lg border border-slate-800/40">
                <span className="text-slate-400 font-mono">Audio Beacon Voice:</span>
                <div className="flex items-center gap-2">
                  <select 
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-[10px] px-1.5 py-0.5 rounded focus:outline-none"
                  >
                    <option value="Kore">Kore (Vibrant)</option>
                    <option value="Zephyr">Zephyr (Warm)</option>
                    <option value="Charon">Charon (Calm)</option>
                    <option value="Puck">Puck (Energetic)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Conversational Screen */}
            <div className="flex-grow overflow-y-auto my-3 space-y-3 pr-1 text-xs">
              {messages.map(m => (
                <div 
                  key={m.id} 
                  className={`flex flex-col gap-1 p-2.5 rounded-xl border max-w-[90%] transition-all ${
                    m.role === 'user' 
                      ? 'ml-auto bg-blue-500/5 border-blue-500/10 text-slate-200' 
                      : 'bg-slate-900/30 border-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-900/50 pb-1 mb-1.5">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      {m.role === 'user' ? 'BILLIE' : 'CEREBRO CORE'}
                    </span>
                    {m.role === 'assistant' && (
                      <button 
                        onClick={() => speakText(m.content)}
                        className={`hover:text-blue-400 transition-all ${isSpeaking ? 'text-blue-400 animate-pulse' : 'text-slate-500'}`}
                        title="Speak diagnostics report"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-line leading-relaxed text-[11px] font-mono">{m.content}</p>
                </div>
              ))}
              
              {/* Grounding sources display */}
              {sources.length > 0 && (
                <div className="bg-slate-900/40 border border-slate-800/60 p-2 rounded-xl text-[10px]">
                  <span className="text-blue-400 font-mono block mb-1">Sources identified:</span>
                  <ul className="space-y-1 list-disc list-inside">
                    {sources.map((s, idx) => (
                      <li key={idx}>
                        <a href={s.uri} target="_blank" rel="noreferrer" className="hover:underline text-slate-400">
                          {s.title || s.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isGenerating && (
                <div className="flex items-center gap-2 p-2 text-[10px] font-mono text-slate-400 animate-pulse">
                  <Cpu className="h-4 w-4 text-blue-400 animate-spin" />
                  Analyzing cortical telemetry waves...
                </div>
              )}
            </div>

            {/* Quick Diagnostic Prompts */}
            <div className="grid grid-cols-2 gap-1.5 mb-3 border-t border-slate-900 pt-3">
              <button 
                onClick={() => handleQuickPrompt("Analyze current focus profile")}
                className="bg-slate-900/50 hover:bg-slate-900 border border-slate-800 text-[10px] text-slate-300 py-1 px-2 rounded-lg text-left truncate transition-all"
              >
                Focus profile diagnostic
              </button>
              <button 
                onClick={() => handleQuickPrompt("Realignment recommendations")}
                className="bg-slate-900/50 hover:bg-slate-900 border border-slate-800 text-[10px] text-slate-300 py-1 px-2 rounded-lg text-left truncate transition-all"
              >
                Realignment recommendations
              </button>
            </div>

            {/* Chat inputs */}
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input 
                type="text" 
                placeholder="Ask CerebrO Core..." 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="flex-grow bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <button 
                type="submit"
                disabled={isGenerating}
                className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-[0_0_10px_rgba(59,130,246,0.3)]"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </main>

      {/* --- TELEMETRY LOG STATUS BAR --- */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-3 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span className="font-mono text-[10px] tracking-wider uppercase text-slate-400">BCI FEED CONNECTED</span>
          </div>
          <div className="hidden md:flex items-center gap-2 border-l border-slate-800 pl-4">
            <Terminal className="h-3.5 w-3.5 text-slate-600" />
            <span className="font-mono text-[10px] text-slate-400 truncate max-w-sm">
              {logs.length > 0 ? `Latest: ${logs[0].text}` : 'Ready for telemetry...'}
            </span>
          </div>
        </div>
        <div className="font-mono text-[10px] text-slate-400 mt-2 md:mt-0 flex gap-4">
          <span>Focus Synchronization: Alpha: {frequencies.alpha.freq}Hz</span>
          <span>Core Temp: 36.6°C</span>
        </div>
      </footer>
    </div>
  );
}