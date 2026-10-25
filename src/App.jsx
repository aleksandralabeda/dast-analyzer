import React, { useState, useEffect, useCallback } from 'react';
import { Send, Minimize2, Maximize2, Loader2, RefreshCw, Settings, History, X, ArrowLeft, Download, GitCompare, CheckSquare, Square } from 'lucide-react';

const MODELS = [
  { id: 'cerebras-llama', name: 'Cerebras Llama 3.3 70B', provider: 'cerebras', color: 'bg-blue-500' },
  { id: 'cerebras-qwen', name: 'Cerebras Qwen 3 32B', provider: 'cerebras', color: 'bg-purple-500' },
  { id: 'cerebras-gpt', name: 'Cerebras GPT-oss 120B', provider: 'cerebras', color: 'bg-indigo-500' },
  { id: 'openrouter-trinity', name: 'OpenRouter Trinity Large Preview (free)', provider: 'openrouter', color: 'bg-orange-500' },
  { id: 'gemini-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', color: 'bg-green-500' }
];

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant. Respond naturally to user queries.`;

export default function DASTAnalyzer() {
  const [step, setStep] = useState('initial');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [initialPrompt, setInitialPrompt] = useState('');
  const [conversations, setConversations] = useState({});
  const [minimized, setMinimized] = useState({});
  const [loading, setLoading] = useState({});
  const [followUpPrompts, setFollowUpPrompts] = useState({});

  // Historia analiz
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [viewingHistoryId, setViewingHistoryId] = useState(null);

  // Backup stanu przed otwarciem settings/history
  const [stateBackup, setStateBackup] = useState(null);

  // Porównywanie modeli
  const [selectedForComparison, setSelectedForComparison] = useState([]);

  // NOWE: Kolejność kafelków
  const [modelOrder, setModelOrder] = useState(MODELS.map(m => m.id));

  // NOWE: Bulk messaging
  const [bulkMessage, setBulkMessage] = useState('');
  const [selectedModels, setSelectedModels] = useState([]);

  // NOWE: Drag and drop
  const [draggedModel, setDraggedModel] = useState(null);

  // Generation temperature
  const [globalTemperature, setGlobalTemperature] = useState(0.7);

  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    const savedHistory = localStorage.getItem('dast-analysis-history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setAnalysisHistory(parsed);
        console.log('Loaded history:', parsed.length, 'sessions');
      } catch (e) {
        console.error('Failed to load history:', e);
        localStorage.removeItem('dast-analysis-history');
      }
    }
    setHistoryLoaded(true);
  }, []);

  // SAVE to localStorage whenever history changes
  useEffect(() => {
    if (!historyLoaded) return;

    try {
      localStorage.setItem('dast-analysis-history', JSON.stringify(analysisHistory));
      console.log('Saved history:', analysisHistory.length, 'sessions');
    } catch (e) {
      console.error('Failed to save history:', e);
    }
  }, [analysisHistory, historyLoaded]);


// REAL API calls
const queryModel = async (modelId, prompt, conversationHistory = [], customSystemPrompt = null) => {
  const sysPrompt = customSystemPrompt || systemPrompt;
  const temperature = globalTemperature; // Użyj globalnej temperatury

  // Przygotuj messages w formacie OpenAI
  const messages = [
    { role: "system", content: sysPrompt },
    ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
    { role: "user", content: prompt }
  ];

  try {
    // CEREBRAS (3 modele)
    if (modelId.startsWith('cerebras')) {
      const modelMap = {
        'cerebras-llama': 'llama-3.3-70b',
        'cerebras-qwen': 'qwen-3-32b',
        'cerebras-gpt': 'gpt-oss-120b'
      };

      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_CEREBRAS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelMap[modelId],
          messages: messages,
          max_tokens: 15000,
          temperature: temperature
        })
      });

      if (!response.ok) throw new Error(`Cerebras error: ${response.status}`);
      const data = await response.json();
      let content = data.choices?.[0]?.message?.content ?? '';

      if (!content) return 'Error: Empty response from Cerebras';

      const finish = data.choices?.[0]?.finish_reason;
      if (finish === 'length') {
        content += "\n\n[UCIĘTE: limit max_tokens — zwiększ max_tokens albo dodaj auto-continue]";
      }


      if (content.includes('<think>') && content.includes('</think>')) {
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      } else {
        content = content.trim();
      }

      return content;
    }

// OPENROUTER
if (modelId.startsWith('openrouter')) {
  const modelMap = {
    'openrouter-trinity': 'arcee-ai/trinity-large-preview:free',
    // alternatywy (też free na liście OpenRouter, jakby Trinity padło):
    // 'openrouter-nemotron': 'nvidia/nemotron-3-nano-30b-a3b:free',
    // 'openrouter-lfm-thinking': 'liquid/lfm2.5-1.2b-thinking:free',
  };

  const selectedModel = modelMap[modelId];
  if (!selectedModel) return `Error: Unknown OpenRouter modelId: ${modelId}`;

  const url = 'https://openrouter.ai/api/v1/chat/completions';

  let raw = '';
  let data = null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',

        // Identify the application in OpenRouter requests.
        'HTTP-Referer': window.location.origin,
        'X-Title': 'DASTAnalyzer',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature,
        max_tokens: 6000,
      }),
    });

    raw = await response.text();

    // Spróbuj zdekodować JSON jeśli się da
    try { data = JSON.parse(raw); } catch { data = null; }

    if (!response.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        raw?.slice(0, 300) ||
        `HTTP ${response.status}`;

      if (response.status === 401) {
        throw new Error(`OpenRouter 401: zły/nieustawiony VITE_OPENROUTER_API_KEY. ${msg}`);
      }
      if (response.status === 403) {
        throw new Error(`OpenRouter 403: brak uprawnień / model niedostępny / blokada. ${msg}`);
      }
      if (response.status === 429) {
        throw new Error(`OpenRouter 429: rate limit (free tier). ${msg}`);
      }
      throw new Error(`OpenRouter ${response.status}: ${msg}`);
    }

    const choice = data?.choices?.[0];
    let content = choice?.message?.content ?? '';

    if (!content) {
      // czasem modele/tooling potrafią zwrócić pusty content — pokaż coś diagnostycznego
      return `Error: OpenRouter empty content. raw=${raw.slice(0, 300)}`;
    }

    if (choice?.finish_reason === 'length') {
      content += "\n\n[UCIĘTE: finish_reason=length — zmniejsz prompt albo dołóż auto-continue]";
    }

    return content;
  } catch (e) {
    // Jeśli to CORS / network w przeglądarce, fetch często daje tylko TypeError: Failed to fetch
    if (String(e?.message || '').includes('Failed to fetch')) {
      return `Error: Failed to fetch (CORS/proxy/network). Jeśli odpalasz to w przeglądarce, rozważ backend proxy (Vercel/Netlify/Express) zamiast wołać OpenRouter bezpośrednio.`;
    }
    return `Error: ${e.message || e}`;
  }
}



    // GEMINI
if (modelId === 'gemini-flash') {
  // Buduj contents z pełną historią konwersacji
  const geminiContents = [];

  // Dodaj system prompt jako pierwszą wiadomość użytkownika
  if (sysPrompt) {
    geminiContents.push({
      role: 'user',
      parts: [{ text: `System instructions: ${sysPrompt}` }]
    });
    geminiContents.push({
      role: 'model',
      parts: [{ text: 'Understood. I will follow these instructions.' }]
    });
  }

  // Dodaj historię konwersacji
  conversationHistory.forEach(msg => {
    geminiContents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  });

  // Dodaj aktualny prompt
  geminiContents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: geminiContents,
      generationConfig: {
        maxOutputTokens: 50000,
        temperature: temperature
      }
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    console.error('Gemini error:', errData);

    // Specjalna obsługa przekroczenia limitów
    if (response.status === 429) {
      const retryAfter = errData.error?.message?.match(/retry in ([\d.]+)s/)?.[1];
      if (retryAfter) {
        throw new Error(`Gemini: Quota exceeded. Retry in ${Math.ceil(retryAfter)}s. Check usage: https://ai.dev/usage`);
      }
      throw new Error(`Gemini: Daily quota exceeded. Check your usage at https://ai.dev/usage`);
    }

    throw new Error(`Gemini ${response.status}: ${errData.error?.message || 'Unknown'}`);
  }

  const data = await response.json();

  const cand = data.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const text = parts.map(p => p.text ?? '').join('').trim();

  return text || `Error: Gemini returned empty text (finishReason=${cand?.finishReason || 'unknown'})`;

}

  } catch (error) {
    console.error(`API Error [${modelId}]:`, error);
    return `Error: ${error.message}`;
  }
};


const saveCurrentSession = useCallback(() => {
  if (Object.keys(conversations).length === 0) return;

  const sessionId = currentSessionId || Date.now().toString();
  const session = {
    id: sessionId,
    timestamp: Date.now(),
    systemPrompt: systemPrompt,
    globalTemperature: globalTemperature,
    initialPrompt: initialPrompt,
    conversations: conversations,
    minimized: minimized,
    modelOrder: modelOrder
  };

  setAnalysisHistory(prev => {
    const existing = prev.findIndex(s => s.id === sessionId);
    let newHistory;

    if (existing >= 0) {
      newHistory = [...prev];
      newHistory[existing] = session;
    } else {
      newHistory = [session, ...prev];
    }

    // Immediate save to localStorage
    try {
      localStorage.setItem('dast-analysis-history', JSON.stringify(newHistory));
      console.log('Session saved:', sessionId);
    } catch (e) {
      console.error('Failed to save session:', e);
    }

    return newHistory;
  });

  setCurrentSessionId(sessionId);
}, [
  conversations,
  currentSessionId,
  systemPrompt,
  globalTemperature,
  initialPrompt,
  minimized,
  modelOrder
]);

  useEffect(() => {
    if (!historyLoaded || step !== 'results') return;
    if (Object.keys(conversations).length === 0) return;

    const timer = setTimeout(() => {
      saveCurrentSession();
    }, 1000);

    return () => clearTimeout(timer);
  }, [conversations, historyLoaded, step, saveCurrentSession]);

  const loadHistorySession = (sessionId) => {
    const session = analysisHistory.find(s => s.id === sessionId);
    if (!session) return;

    setSystemPrompt(session.systemPrompt);
    setGlobalTemperature(session.globalTemperature ?? 0.7);
    setInitialPrompt(session.initialPrompt);
    setConversations(session.conversations);
    setMinimized(session.minimized || {});
    setModelOrder(session.modelOrder || MODELS.map(m => m.id));
    setViewingHistoryId(sessionId);
    setCurrentSessionId(sessionId);
    setStep('results');
  };

  const deleteHistorySession = (sessionId) => {
    setAnalysisHistory(prev => {
      const newHistory = prev.filter(s => s.id !== sessionId);

      // Immediate save to localStorage
      try {
        localStorage.setItem('dast-analysis-history', JSON.stringify(newHistory));
        console.log('Session deleted:', sessionId);
      } catch (e) {
        console.error('Failed to delete session:', e);
      }

      return newHistory;
    });

    if (viewingHistoryId === sessionId) {
      setViewingHistoryId(null);
    }
  };

  const clearAllHistory = () => {
  if (confirm('Are you sure you want to delete ALL history? This cannot be undone.')) {
    setAnalysisHistory([]);
    localStorage.removeItem('dast-analysis-history');
    console.log('All history cleared');
  }
};

  const handleInitialSubmit = async () => {
    if (!initialPrompt.trim()) return;

    setStep('analyzing');
    const newConversations = {};
    const newLoading = {};

    MODELS.forEach(model => {
      newLoading[model.id] = true;
    });
    setLoading(newLoading);

    // OZDZIEL modele Cerebras od reszty
    const cerebrasModels = MODELS.filter(m => m.provider === 'cerebras');
    const otherModels = MODELS.filter(m => m.provider !== 'cerebras');

    // CEREBRAS: po kolei z 3-sekundową przerwą
    for (const model of cerebrasModels) {
      let retries = 2;
      let success = false;

      while (retries > 0 && !success) {
        try {
          const response = await queryModel(model.id, initialPrompt, [], systemPrompt);
          newConversations[model.id] = [
            { role: 'user', content: initialPrompt },
            { role: 'assistant', content: response }
          ];
          success = true;
        } catch (error) {
          if (error.message.includes('429') && retries > 1) {
            console.log(`⏳ Rate limit for ${model.name}. Waiting 10s...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            retries--;
          } else {
            newConversations[model.id] = [
              { role: 'user', content: initialPrompt },
              { role: 'assistant', content: `Error: ${error.message}` }
            ];
            break;
          }
        }
      }

      // CZEKAJ 3 sekundy między requestami Cerebras
      if (cerebrasModels.indexOf(model) < cerebrasModels.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // POZOSTAŁE (OpenRouter, Gemini): jednocześnie
    const otherPromises = otherModels.map(async (model) => {
      try {
        const response = await queryModel(model.id, initialPrompt, [], systemPrompt);
        return { modelId: model.id, response };
      } catch (error) {
        return { modelId: model.id, response: `Error: ${error.message}` };
      }
    });

    const otherResults = await Promise.all(otherPromises);
    otherResults.forEach(({ modelId, response }) => {
      newConversations[modelId] = [
        { role: 'user', content: initialPrompt },
        { role: 'assistant', content: response }
      ];
    });

    setConversations(newConversations);
    setLoading({});
    setCurrentSessionId(Date.now().toString());
    setStep('results');
  };

  const handleFollowUp = async (modelId) => {
    const prompt = followUpPrompts[modelId];
    if (!prompt?.trim()) return;

    setLoading({ ...loading, [modelId]: true });

    const response = await queryModel(
      modelId,
      prompt,
      conversations[modelId],
      systemPrompt
    );

    const updatedConversations = {
      ...conversations,
      [modelId]: [
        ...conversations[modelId],
        { role: 'user', content: prompt },
        { role: 'assistant', content: response }
      ]
    };

    setConversations(updatedConversations);
    setFollowUpPrompts({ ...followUpPrompts, [modelId]: '' });
    setLoading({ ...loading, [modelId]: false });

    setTimeout(() => {
    saveCurrentSession();
    }, 100);
  };

  const handleBulkMessage = async () => {
    if (!bulkMessage.trim() || selectedModels.length === 0) return;

    const newLoading = {};
    selectedModels.forEach(modelId => {
      newLoading[modelId] = true;
    });
    setLoading({ ...loading, ...newLoading });

    // ROZDZIEL Cerebras od reszty
    const cerebrasSelected = selectedModels.filter(id =>
      MODELS.find(m => m.id === id)?.provider === 'cerebras'
    );
    const otherSelected = selectedModels.filter(id =>
      MODELS.find(m => m.id === id)?.provider !== 'cerebras'
    );

    const updatedConversations = { ...conversations };

    // CEREBRAS: po kolei
    for (const modelId of cerebrasSelected) {
      try {
        const response = await queryModel(
          modelId,
          bulkMessage,
          updatedConversations[modelId] || [],
          systemPrompt
        );
        updatedConversations[modelId] = [
          ...(updatedConversations[modelId] || []),
          { role: 'user', content: bulkMessage },
          { role: 'assistant', content: response }
        ];
      } catch (error) {
        updatedConversations[modelId] = [
          ...(updatedConversations[modelId] || []),
          { role: 'user', content: bulkMessage },
          { role: 'assistant', content: `Error: ${error.message}` }
        ];
      }

      //  PRZERWA między Cerebras
      if (cerebrasSelected.indexOf(modelId) < cerebrasSelected.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // POZOSTAŁE: jednocześnie
    const otherPromises = otherSelected.map(async (modelId) => {
      try {
        const response = await queryModel(
          modelId,
          bulkMessage,
          updatedConversations[modelId] || [],
          systemPrompt
        );
        return { modelId, response };
      } catch (error) {
        return { modelId, response: `Error: ${error.message}` };
      }
    });

    const otherResults = await Promise.all(otherPromises);
    otherResults.forEach(({ modelId, response }) => {
      updatedConversations[modelId] = [
        ...(updatedConversations[modelId] || []),
        { role: 'user', content: bulkMessage },
        { role: 'assistant', content: response }
      ];
    });

    setConversations(updatedConversations);
    setBulkMessage('');
    setLoading({});
    setTimeout(() => {
      saveCurrentSession();
    }, 100);
  };

  const handleResetSingleModel = async (modelId) => {
    if (!initialPrompt.trim()) return;

    setLoading({ ...loading, [modelId]: true });

    const response = await queryModel(modelId, initialPrompt, [], systemPrompt);

    setConversations({
      ...conversations,
      [modelId]: [
        { role: 'user', content: initialPrompt },
        { role: 'assistant', content: response }
      ]
    });

    setLoading({ ...loading, [modelId]: false });
  };

  const toggleMinimize = (modelId) => {
    setMinimized(prev => ({ ...prev, [modelId]: !prev[modelId] }));
  };

  const handleNewAnalysis = () => {
    saveCurrentSession();

    setStep('initial');
    setConversations({});
    setMinimized({});
    setInitialPrompt('');
    setCurrentSessionId(null);
    setViewingHistoryId(null);
    setSelectedModels([]);
    setModelOrder(MODELS.map(m => m.id));
  };

  const openSettings = () => {
    setStateBackup({
      step,
      conversations,
      minimized,
      initialPrompt,
      currentSessionId,
      viewingHistoryId
    });
    setStep('settings');
  };

  const closeSettings = () => {
    if (stateBackup) {
      setStep(stateBackup.step);
      setConversations(stateBackup.conversations);
      setMinimized(stateBackup.minimized);
      setInitialPrompt(stateBackup.initialPrompt);
      setCurrentSessionId(stateBackup.currentSessionId);
      setViewingHistoryId(stateBackup.viewingHistoryId);
      setStateBackup(null);
    } else {
      setStep('initial');
    }
  };

  const openHistory = () => {
    setStateBackup({
      step,
      conversations,
      minimized,
      initialPrompt,
      currentSessionId,
      viewingHistoryId
    });
    setStep('history');
  };

  const closeHistory = () => {
    if (stateBackup) {
      setStep(stateBackup.step);
      setConversations(stateBackup.conversations);
      setMinimized(stateBackup.minimized);
      setInitialPrompt(stateBackup.initialPrompt);
      setCurrentSessionId(stateBackup.currentSessionId);
      setViewingHistoryId(stateBackup.viewingHistoryId);
      setStateBackup(null);
    } else {
      setStep('initial');
    }
  };

  const exportToJSON = () => {
    const exportData = {
      timestamp: Date.now(),
      systemPrompt: systemPrompt,
      initialPrompt: initialPrompt,
      conversations: conversations,
      models: MODELS.map(m => ({ id: m.id, name: m.name }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dast-analysis-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleModelSelection = (modelId) => {
    setSelectedForComparison(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  // NOWE: Toggle pojedynczego modelu dla bulk messaging
  const toggleSingleModel = (modelId) => {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  // NOWE: Select all models
  const toggleSelectAll = () => {
    if (selectedModels.length === MODELS.length) {
      setSelectedModels([]);
    } else {
      setSelectedModels(MODELS.map(m => m.id));
    }
  };

  // NOWE: Drag and drop handlers
  const handleDragStart = (e, modelId) => {
    setDraggedModel(modelId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetModelId) => {
    e.preventDefault();

    if (!draggedModel || draggedModel === targetModelId) {
      setDraggedModel(null);
      return;
    }

    const newOrder = [...modelOrder];
    const draggedIndex = newOrder.indexOf(draggedModel);
    const targetIndex = newOrder.indexOf(targetModelId);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedModel);

    setModelOrder(newOrder);
    setDraggedModel(null);
  };

  const openComparison = () => {
    if (selectedForComparison.length < 2) {
      alert('Please select at least 2 models to compare');
      return;
    }
    setStateBackup({
      step,
      conversations,
      minimized,
      initialPrompt,
      currentSessionId,
      viewingHistoryId
    });
    setStep('compare');
  };

  const closeComparison = () => {
    if (stateBackup) {
      setStep(stateBackup.step);
      setConversations(stateBackup.conversations);
      setMinimized(stateBackup.minimized);
      setInitialPrompt(stateBackup.initialPrompt);
      setCurrentSessionId(stateBackup.currentSessionId);
      setViewingHistoryId(stateBackup.viewingHistoryId);
      setStateBackup(null);
    }
    setSelectedForComparison([]);
  };

  useEffect(() => {
    if (step !== 'results' && Object.keys(conversations).length > 0) {
      saveCurrentSession();
    }
  }, [step, conversations, saveCurrentSession]);

  // Compare screen
  if (step === 'compare') {
    const selectedModelsList = MODELS.filter(m => selectedForComparison.includes(m.id));

    const analyzeTextDifferences = () => {
      const analysis = {};

      selectedModelsList.forEach(model => {
        const conv = conversations[model.id] || [];
        const lastResponse = conv.filter(m => m.role === 'assistant').pop();

        if (lastResponse) {
          const content = lastResponse.content;
          const lines = content.split('\n').filter(line => line.trim().length > 0);

          analysis[model.name] = {
            fullText: content,
            lines: lines,
            length: content.length,
            wordCount: content.split(/\s+/).length,
            hasCodeBlocks: content.includes('```'),
            hasLists: content.includes('•') || content.includes('-') || /\d+\./.test(content),
            sentences: content.split(/[.!?]+/).filter(s => s.trim().length > 20),
            paragraphs: content.split('\n\n').filter(p => p.trim().length > 0)
          };
        }
      });

      const modelNames = Object.keys(analysis);
      const differences = {};

      const avgLength = modelNames.reduce((sum, m) => sum + analysis[m].length, 0) / modelNames.length;
      const avgWords = modelNames.reduce((sum, m) => sum + analysis[m].wordCount, 0) / modelNames.length;

      modelNames.forEach(modelName => {
        const otherModels = modelNames.filter(m => m !== modelName);
        const uniqueContent = [];
        const strengths = [];
        const weaknesses = [];

        const currentAnalysis = analysis[modelName];

        currentAnalysis.sentences.forEach(sentence => {
          const isUnique = otherModels.every(otherModel => {
            return !analysis[otherModel].fullText.includes(sentence.trim());
          });

          if (isUnique && sentence.trim().length > 30) {
            uniqueContent.push(sentence.trim());
          }
        });

        if (currentAnalysis.length > avgLength * 1.2) {
          strengths.push(`Najdłuższa odpowiedź (${currentAnalysis.length} znaków vs średnia ${Math.round(avgLength)})`);
        }

        if (currentAnalysis.wordCount > avgWords * 1.2) {
          strengths.push(`Najbardziej szczegółowa (${currentAnalysis.wordCount} słów vs średnia ${Math.round(avgWords)})`);
        }

        if (currentAnalysis.hasCodeBlocks && !otherModels.some(m => analysis[m].hasCodeBlocks)) {
          strengths.push('Jedyna odpowiedź z przykładami kodu');
        }

        if (currentAnalysis.hasLists && !otherModels.every(m => analysis[m].hasLists)) {
          strengths.push('Lepiej zorganizowana struktura (listy/punkty)');
        }

        if (uniqueContent.length > 3) {
          strengths.push(`Najwięcej unikalnych informacji (${uniqueContent.length} unikalnych fragmentów)`);
        }

        const paragraphCount = currentAnalysis.paragraphs.length;
        const avgParagraphs = modelNames.reduce((sum, m) => sum + analysis[m].paragraphs.length, 0) / modelNames.length;
        if (paragraphCount > avgParagraphs * 1.3) {
          strengths.push(`Najlepsza struktura (${paragraphCount} akapitów vs średnia ${Math.round(avgParagraphs)})`);
        }

        if (currentAnalysis.length < avgLength * 0.7) {
          weaknesses.push(`Najkrótsza odpowiedź (${currentAnalysis.length} znaków vs średnia ${Math.round(avgLength)})`);
        }

        if (currentAnalysis.wordCount < avgWords * 0.7) {
          weaknesses.push(`Najmniej szczegółowa (${currentAnalysis.wordCount} słów vs średnia ${Math.round(avgWords)})`);
        }

        if (!currentAnalysis.hasCodeBlocks && otherModels.some(m => analysis[m].hasCodeBlocks)) {
          weaknesses.push('Brak przykładów kodu (inne modele je mają)');
        }

        if (!currentAnalysis.hasLists && otherModels.some(m => analysis[m].hasLists)) {
          weaknesses.push('Słabsza organizacja (brak list/struktury)');
        }

        if (uniqueContent.length === 0) {
          weaknesses.push('Brak unikalnych informacji (podobna do innych odpowiedzi)');
        }

        if (uniqueContent.length < 2 && uniqueContent.length > 0) {
          weaknesses.push('Bardzo mało unikalnej treści w porównaniu z innymi');
        }

        if (strengths.length === 0) {
          strengths.push('Odpowiedź w średnim zakresie - zbilansowana');
        }

        differences[modelName] = {
          unique: uniqueContent.slice(0, 5),
          stats: currentAnalysis,
          strengths: strengths,
          weaknesses: weaknesses.length > 0 ? weaknesses : ['Brak wyraźnych słabości w porównaniu z innymi']
        };
      });

      return differences;
    };

    const textDifferences = analyzeTextDifferences();

    return (
      <div className="min-h-screen bg-zinc-900 p-3 sm:p-6 lg:p-8 text-xl leading-relaxed [overflow-wrap:anywhere]" style={{ fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 20, '--font-code': 'Consolas, "Courier New", monospace' }}>
        <div className="w-full max-w-[1800px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <GitCompare className="w-8 h-8 text-teal-500" />
            <h1 className="text-[28px] sm:text-[32px] font-semibold text-white">Response comparison</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {analysisHistory.length > 0 && (
              <button
                onClick={clearAllHistory}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                Clear history ({analysisHistory.length})
              </button>
            )}
            <button
              onClick={closeComparison}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 rounded-md transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
          </div>
        </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 min-[1920px]:grid-cols-3 gap-6 mb-6">
            {selectedModelsList.map(model => {
              const diff = textDifferences[model.name];
              if (!diff) return null;

              return (
                <div key={model.id} className="min-w-0 bg-zinc-800 rounded-md p-4 sm:p-6 border border-zinc-700">
                  <div className="flex min-w-0 items-center gap-2 mb-4">
                    <div className={`w-5 h-5 rounded-full ${model.color}`} />
                    <h3 className="text-white font-semibold">{model.name}</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-zinc-900 rounded p-3">
                        <p className="text-base text-zinc-300 uppercase mb-1">Length</p>
                        <p className="text-xl text-white font-semibold">
                          {diff.stats.length} chars
                        </p>
                      </div>
                      <div className="bg-zinc-900 rounded p-3">
                        <p className="text-base text-zinc-300 uppercase mb-1">Words</p>
                        <p className="text-xl text-white font-semibold">
                          {diff.stats.wordCount}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-base text-zinc-300 uppercase font-semibold">Format</p>
                      <div className="flex flex-wrap gap-2">
                        {diff.stats.hasCodeBlocks && (
                          <span className="px-2 py-1 bg-blue-900/30 text-blue-300 text-base rounded">
                            Code blocks
                          </span>
                        )}
                        {diff.stats.hasLists && (
                          <span className="px-2 py-1 bg-purple-900/30 text-purple-300 text-base rounded">
                            Lists/Structure
                          </span>
                        )}
                        {!diff.stats.hasCodeBlocks && !diff.stats.hasLists && (
                          <span className="px-2 py-1 bg-zinc-700 text-zinc-300 text-base rounded">
                            Plain text
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-base text-zinc-300 uppercase font-semibold mb-2">
                         Mocne strony
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {diff.strengths.map((strength, i) => (
                          <div key={i} className="text-base text-green-400 bg-green-900/20 rounded px-2 py-1">
                            • {strength}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-base text-zinc-300 uppercase font-semibold mb-2">
                         Słabe strony
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {diff.weaknesses.map((weakness, i) => (
                          <div key={i} className="text-base text-orange-400 bg-orange-900/20 rounded px-2 py-1">
                            • {weakness}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-base text-zinc-300 uppercase font-semibold mb-2">
                         Unique Content ({diff.unique.length})
                      </p>
                      {diff.unique.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {diff.unique.map((fragment, i) => (
                            <div key={i} className="bg-zinc-900/50 border border-zinc-700 rounded p-2">
                              <p className="text-base text-zinc-300 leading-relaxed">
                                "{fragment}..."
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-lg text-zinc-500 italic">
                          No unique content found - response similar to others
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-zinc-800 rounded-md border border-zinc-700 p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Side-by-side Response Comparison</h2>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {selectedModelsList.map(model => {
                const conv = conversations[model.id] || [];
                const lastResponse = conv.filter(m => m.role === 'assistant').pop();

                return (
                  <div key={model.id} className="min-w-0 bg-zinc-900 rounded-md p-4 border border-zinc-600">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`mt-1 shrink-0 w-3 h-3 rounded-full ${model.color}`} />
                      <h4 className="text-white font-semibold text-lg">{model.name}</h4>
                    </div>
                    <div style={{ fontSize: 24, lineHeight: 1.65 }} className="text-zinc-100 text-xl sm:text-2xl leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] max-h-[40rem] overflow-y-auto">
                      {lastResponse?.content || 'No response yet'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Settings screen
  if (step === 'settings') {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-3 sm:p-6 lg:p-8 text-xl leading-relaxed [overflow-wrap:anywhere]" style={{ fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 20, '--font-code': 'Consolas, "Courier New", monospace' }}>
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <Settings className="w-8 h-8 text-zinc-300 mx-auto mb-4" />
            <h1 className="text-[28px] sm:text-[32px] font-semibold text-white mb-2">
              Configure System Prompt
            </h1>
            <p className="text-zinc-300">
              Set the behavior and context for all AI models
            </p>
          </div>

          <div className="bg-zinc-800 rounded-md p-4 sm:p-6 border border-zinc-700">
            <label className="block text-lg font-medium text-zinc-300 mb-3">
              System Prompt (applies to all models)
            </label>
            <textarea style={{ fontSize: 20, lineHeight: 1.6 }}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter system prompt to define model behavior..."
              className="w-full h-48 bg-zinc-900 text-zinc-100 rounded-md p-4 border border-zinc-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none resize-none text-xl leading-relaxed"
            />

            {/* TEMPERATURE SLIDER */}
            <div className="mt-6 p-4 bg-zinc-700/30 rounded-md border border-zinc-600">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-lg font-medium text-zinc-300">
                  Temperature
                </label>
                <span className="text-xl [font-family:var(--font-code)] text-white bg-zinc-800 px-3 py-1 rounded">
                  {globalTemperature.toFixed(2)}
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={globalTemperature}
                onChange={(e) => setGlobalTemperature(parseFloat(e.target.value))}
                className="w-full h-3 bg-zinc-600 rounded-md appearance-none cursor-pointer slider-thumb"
                style={{
                  background: `linear-gradient(to right, #0f766e 0%, #0f766e ${(globalTemperature / 2) * 100}%, #52525b ${(globalTemperature / 2) * 100}%, #52525b 100%)`
                }}
              />

              <div className="flex justify-between text-base text-zinc-300 mt-2 mb-3">
                <span>0.0</span>
                <span>0.5</span>
                <span>1.0</span>
                <span>1.5</span>
                <span>2.0</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <button
                  onClick={() => setGlobalTemperature(0.0)}
                  className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 text-base rounded transition-colors"
                >
                  Temperature 0.0
                </button>
                <button
                  onClick={() => setGlobalTemperature(0.7)}
                  className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 text-base rounded transition-colors"
                >
                  Temperature 0.7
                </button>
                <button
                  onClick={() => setGlobalTemperature(1.5)}
                  className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 text-base rounded transition-colors"
                >
                  Temperature 1.5
                </button>
              </div>

              <p className="text-base text-zinc-300 leading-relaxed">
                <strong>Temperature</strong> controls response randomness:<br/>
                • <strong>0.0</strong> = Lower randomness<br/>
                • <strong>0.7</strong> = Moderate randomness<br/>
                • <strong>1.5-2.0</strong> = Higher randomness
              </p>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={closeSettings}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-4 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Analysis
              </button>
              <button
                onClick={() => {
                  setStep('initial');
                  setConversations({});
                  setMinimized({});
                  setInitialPrompt('');
                  setCurrentSessionId(null);
                  setViewingHistoryId(null);
                  setStateBackup(null);
                }}
                className="flex-1 bg-teal-700 hover:bg-teal-800 text-white font-semibold py-4 rounded-md transition-colors"
              >
                Begin New Analysis
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // History screen
  if (step === 'history') {
    return (
      <div className="min-h-screen bg-zinc-900 p-3 sm:p-6 lg:p-8 text-xl leading-relaxed [overflow-wrap:anywhere]" style={{ fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 20, '--font-code': 'Consolas, "Courier New", monospace' }}>
        <div className="w-full max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <History className="w-8 h-8 text-teal-500" />
              <h1 className="text-[28px] sm:text-[32px] font-semibold text-white">Analysis History</h1>
            </div>
            <button
              onClick={closeHistory}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 rounded-md transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
          </div>

          {analysisHistory.length === 0 ? (
            <div className="bg-zinc-800 rounded-md p-5 sm:p-10 text-center border border-zinc-700">
              <History className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-300 text-xl">No analysis history yet</p>
              <p className="text-zinc-500 text-lg mt-2">Your completed analyses will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {analysisHistory.map((session) => {
                const date = new Date(session.timestamp);
                const isCurrentSession = session.id === viewingHistoryId;

                return (
                  <div
                    key={session.id}
                    className={`bg-zinc-800 rounded-md p-6 border transition-colors ${
                      isCurrentSession
                        ? 'border-teal-500 bg-teal-900/10'
                        : 'border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="text-white font-semibold">
                            {date.toLocaleDateString('pl-PL', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </h3>
                          {isCurrentSession && (
                            <span className="px-2 py-1 bg-teal-700 text-white text-base rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-lg text-zinc-300 mb-2">
                          System Prompt: {session.systemPrompt.substring(0, 80)}...
                        </p>
                        <p className="text-lg text-zinc-300 bg-zinc-900/50 p-3 rounded">
                          {session.initialPrompt.substring(0, 150)}
                          {session.initialPrompt.length > 150 && '...'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2 sm:ml-4">
                        <button
                          onClick={() => loadHistorySession(session.id)}
                          className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md transition-colors text-lg"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => deleteHistorySession(session.id)}
                          className="p-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-md transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-base text-zinc-300">
                      <span>Models: {Object.keys(session.conversations).length}</span>
                      <span>•</span>
                      <span>
                        Messages: {Object.values(session.conversations).reduce(
                          (sum, conv) => sum + conv.length, 0
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Initial screen
  if (step === 'initial' || step === 'analyzing') {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-3 sm:p-6 lg:p-8 text-xl leading-relaxed [overflow-wrap:anywhere]" style={{ fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 20, '--font-code': 'Consolas, "Courier New", monospace' }}>
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <h1 className="text-[28px] sm:text-[32px] font-semibold text-white mb-2">
              DAST Analyzer
            </h1>
            <p className="text-zinc-300">
              Compare model guidance for Android security testing.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={openSettings}
                className="text-lg text-teal-400 hover:text-teal-300 flex items-center gap-1"
              >
                <Settings className="w-5 h-5" />
                Settings
              </button>
              <span className="text-zinc-600">•</span>
              <button
                onClick={openHistory}
                className="text-lg text-teal-400 hover:text-teal-300 flex items-center gap-1"
              >
                <History className="w-5 h-5" />
                View History ({analysisHistory.length})
              </button>
            </div>
          </div>

          <div className="bg-zinc-800 rounded-md p-4 sm:p-6 border border-zinc-700">
            <div className="mb-4 p-3 bg-zinc-700/50 rounded-md">
              <p className="text-base text-zinc-300 [font-family:var(--font-code)]">System Prompt:</p>
              <p className="text-lg text-zinc-300 mt-1">{systemPrompt}</p>
            </div>

            <label className="block text-lg font-medium text-zinc-300 mb-3">
              Your Query
            </label>
            <textarea style={{ fontSize: 20, lineHeight: 1.6 }}
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="Enter your question or paste DAST report here...

Example: 'Hello, can you help me analyze security vulnerabilities?'"
              className="w-full h-64 bg-zinc-900 text-zinc-100 rounded-md p-4 border border-zinc-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none resize-none [font-family:var(--font-code)] text-xl leading-relaxed"
              disabled={step === 'analyzing'}
            />

            <button
              onClick={handleInitialSubmit}
              disabled={step === 'analyzing' || !initialPrompt.trim()}
              className="mt-6 w-full bg-teal-700 hover:bg-teal-800 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-md flex items-center justify-center gap-2 transition-colors"
            >
              {step === 'analyzing' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing with 5 models...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Run analysis
                </>
              )}
            </button>

            {step === 'analyzing' && (
              <div className="mt-6 space-y-2">
                {MODELS.map(model => (
                  <div key={model.id} className="flex items-center gap-3 text-zinc-300 text-lg">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Querying {model.name}...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Results screen with 5 panels
  const orderedModels = modelOrder
    .map(id => MODELS.find(model => model.id === id))
    .filter(Boolean)
    .sort((a, b) => Number(Boolean(minimized[a.id])) - Number(Boolean(minimized[b.id])));

  return (
    <div className="min-h-screen bg-zinc-900 p-3 sm:p-6 lg:p-8 text-xl leading-relaxed [overflow-wrap:anywhere]" style={{ fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 20, '--font-code': 'Consolas, "Courier New", monospace' }}>
      <div className="w-full max-w-[1800px] mx-auto">
        <div className="mb-6 flex flex-col items-start gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-[28px] sm:text-[32px] font-semibold text-white">Model responses</h1>
            {viewingHistoryId && (
              <p className="text-lg text-zinc-300 mt-1">
                Viewing saved session from history
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportToJSON}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 rounded-md transition-colors flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Export JSON
            </button>
            <button
              onClick={openComparison}
              disabled={selectedForComparison.length < 2}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-md transition-colors flex items-center gap-2"
            >
              <GitCompare className="w-5 h-5" />
              Compare ({selectedForComparison.length})
            </button>
            <button
              onClick={openHistory}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 rounded-md transition-colors flex items-center gap-2"
            >
              <History className="w-5 h-5" />
              History ({analysisHistory.length})
            </button>
            <button
              onClick={openSettings}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 rounded-md transition-colors flex items-center gap-2"
            >
              <Settings className="w-5 h-5" />
              Settings
            </button>
            <button
              onClick={handleNewAnalysis}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md transition-colors"
            >
              New Analysis
            </button>
          </div>
        </div>

        {/* NOWE: Bulk messaging panel */}
        <div className="mb-6 bg-zinc-800 rounded-md border border-zinc-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-white font-semibold">Send to Selected Models ({selectedModels.length})</h3>
              <button
                onClick={toggleSelectAll}
                className="text-lg px-3 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded transition-colors flex items-center gap-2"
              >
                {selectedModels.length === MODELS.length ? (
                  <>
                    <Square className="w-5 h-5" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-5 h-5" />
                    Select All
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input style={{ fontSize: 20, lineHeight: 1.6 }}
              type="text"
              value={bulkMessage}
              onChange={(e) => setBulkMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && bulkMessage.trim() && selectedModels.length > 0) {
                  handleBulkMessage();
                }
              }}
              placeholder="Enter message to send to all selected models..."
              className="min-w-0 flex-1 bg-zinc-900 text-zinc-100 rounded-md px-4 py-3 border border-zinc-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none text-xl leading-relaxed"
              disabled={selectedModels.length === 0}
            />
            <button
              onClick={handleBulkMessage}
              disabled={!bulkMessage.trim() || selectedModels.length === 0}
              className="bg-teal-700 hover:bg-teal-800 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-md transition-colors flex items-center gap-2"
            >
              <Send className="w-5 h-5" />
              Send to {selectedModels.length} models
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 min-[1920px]:grid-cols-3 items-start gap-6">
          {orderedModels.map(model => {
            const isMinimized = minimized[model.id];
            const conversation = conversations[model.id] || [];
            const isLoading = loading[model.id];
            const isSelected = selectedModels.includes(model.id);

            return (
              <div
                key={model.id}
                data-model-panel={model.id}
                data-panel-state={isMinimized ? 'collapsed' : 'expanded'}
                style={{
                  height: isMinimized ? 'auto' : 'clamp(26rem, 70vh, 42rem)',
                  minHeight: 0,
                  alignSelf: 'start',
                  gridColumn: isMinimized ? '1 / -1' : undefined
                }}
                className={`min-w-0 overflow-hidden bg-zinc-800 rounded-md border flex flex-col ${
                  draggedModel === model.id ? 'opacity-50' : 'opacity-100'
                } ${
                  isSelected ? 'border-teal-500 ring-2 ring-teal-500/30' : 'border-zinc-700'
                }`}
              >
                {/* Header – tylko tu drag & drop */}
                <div
                  className={`flex items-start justify-between gap-2 p-3 sm:p-4 border-b border-zinc-700 bg-zinc-800 cursor-move`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, model.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, model.id)}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <button
                      onClick={() => toggleSingleModel(model.id)}
                      className="text-zinc-300 hover:text-white transition-colors"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-teal-500" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                    <input
                      type="checkbox"
                      checked={selectedForComparison.includes(model.id)}
                      onChange={() => toggleModelSelection(model.id)}
                      className="w-5 h-5 rounded border-zinc-600 bg-zinc-700 checked:bg-teal-700 cursor-pointer"
                      title="Select for comparison"
                    />
                    <div className={`mt-1 shrink-0 w-3 h-3 rounded-full ${model.color}`} />
                    <h3 style={{ fontSize: 20, lineHeight: 1.35 }} className="min-w-0 flex-1 font-semibold text-white text-lg sm:text-xl leading-snug [overflow-wrap:anywhere]">
                      <span className="block">{model.name}</span>
                      <span className="mt-1 block text-base text-zinc-300 [font-family:var(--font-code)] font-normal">
                        T={globalTemperature.toFixed(1)}
                      </span>
                    </h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleResetSingleModel(model.id)}
                      disabled={isLoading}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
                      title="Reset this model"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => toggleMinimize(model.id)}
                      type="button"
                      title={isMinimized ? 'Expand panel' : 'Collapse panel'}
                      aria-label={isMinimized ? 'Expand panel' : 'Collapse panel'}
                      aria-expanded={!isMinimized}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                      {isMinimized ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {!isMinimized && (
                  <>
                    {/* Conversation – tu już można zaznaczać i kopiować tekst */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-5">
                      {conversation.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`${
                            msg.role === 'user'
                              ? 'bg-zinc-900 border-zinc-600'
                              : 'bg-zinc-800 border-zinc-700'
                          } border rounded-md p-3`}
                        >
                          <div className="text-base text-zinc-300 mb-1 font-semibold uppercase">
                            {msg.role === 'user' ? 'You' : model.name}
                          </div>
                          <div style={{ fontSize: 24, lineHeight: 1.65 }} className="text-zinc-100 text-xl sm:text-2xl leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {isLoading && (
                        <div className="flex items-center gap-2 text-zinc-300 text-lg">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      )}
                    </div>

                    {/* Follow-up input */}
                    <div className="p-4 border-t border-zinc-700">
                      <div className="flex flex-wrap gap-2">
                        <input style={{ fontSize: 20, lineHeight: 1.6 }}
                          type="text"
                          value={followUpPrompts[model.id] || ''}
                          onChange={(e) =>
                            setFollowUpPrompts({
                              ...followUpPrompts,
                              [model.id]: e.target.value
                            })
                          }
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !isLoading) {
                              handleFollowUp(model.id);
                            }
                          }}
                          placeholder="Continue conversation..."
                          className="min-w-0 flex-1 bg-zinc-900 text-zinc-100 rounded-md px-3 py-2 border border-zinc-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none text-xl leading-relaxed"
                          disabled={isLoading}
                        />
                        <button
                          onClick={() => handleFollowUp(model.id)}
                          disabled={isLoading || !followUpPrompts[model.id]?.trim()}
                          className="bg-teal-700 hover:bg-teal-800 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white p-2 rounded-md transition-colors"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
