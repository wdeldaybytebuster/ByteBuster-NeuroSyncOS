import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, Key, FileUp } from 'lucide-react';

const API = 'http://localhost:3743';

interface OsTodo {
  id: string;
  dag_node_id: string;
  severity: string;
  escalation_reason: string;
  required_action_type: string;
  status: string;
  created_at: number;
  confidence: number;
}

export function NotificationCenter() {
  const [todos, setTodos] = useState<OsTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolutionInputs, setResolutionInputs] = useState<Record<string, string>>({});

  const fetchTodos = async () => {
    try {
      const res = await fetch(`${API}/api/todos`);
      const data = await res.json();
      if (data.success) {
        setTodos(data.todos);
      }
    } catch (err) {
      console.error('Failed to fetch OS Todos', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodos();
    // Poll for new todos every 10 seconds
    const interval = setInterval(fetchTodos, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleResolve = async (todoId: string, actionType: string) => {
    try {
      const resolutionData = resolutionInputs[todoId] || (actionType === 'APPROVE_BOOLEAN' ? 'approved' : '');
      await fetch(`${API}/api/todos/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todoId, resolutionData })
      });
      // Refresh list
      fetchTodos();
    } catch (err) {
      console.error('Failed to resolve todo', err);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-400 font-mono text-sm">Loading Action Center...</div>;
  }

  if (todos.length === 0) {
    return (
      <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg text-center">
        <CheckCircle className="mx-auto text-green-500 mb-2" size={32} />
        <h3 className="text-gray-300 font-bold">All Clear</h3>
        <p className="text-gray-500 text-sm">No pending escalations or blocked tasks.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
        <AlertTriangle size={24} /> Action Required ({todos.length})
      </h2>
      
      {todos.map(todo => (
        <div key={todo.id} className="p-4 bg-gray-800 border border-gray-700 rounded-lg shadow-lg flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <span className={`text-xs font-bold px-2 py-1 rounded ${todo.severity === 'HIGH' || todo.severity === 'CRITICAL' ? 'bg-red-900/50 text-red-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                {todo.severity}
              </span>
              <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap font-mono break-all bg-gray-900 p-2 rounded border border-gray-700">
                {todo.escalation_reason}
              </p>
            </div>
            <span className="text-xs text-gray-500 font-mono">
              Task: {todo.dag_node_id.substring(0,8)}...
            </span>
          </div>

          <div className="flex items-center gap-3 mt-2 pt-3 border-t border-gray-700">
            {todo.required_action_type === '2FA_INPUT' && (
              <div className="flex-1 flex gap-2">
                <Key className="text-gray-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Enter 2FA Code..." 
                  className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1 text-[var(--color-foreground)] text-sm focus:border-blue-500 outline-none"
                  value={resolutionInputs[todo.id] || ''}
                  onChange={(e) => setResolutionInputs({...resolutionInputs, [todo.id]: e.target.value})}
                />
              </div>
            )}
            
            {todo.required_action_type === 'FILE_UPLOAD' && (
              <div className="flex-1 flex gap-2 items-center text-sm text-gray-400 bg-gray-900 border border-gray-600 rounded px-3 py-1 border-dashed">
                <FileUp size={16} />
                <span>[Mock] Provide required file path</span>
                <input 
                  type="text" 
                  placeholder="/path/to/file.pdf" 
                  className="flex-1 bg-transparent text-[var(--color-foreground)] outline-none"
                  value={resolutionInputs[todo.id] || ''}
                  onChange={(e) => setResolutionInputs({...resolutionInputs, [todo.id]: e.target.value})}
                />
              </div>
            )}

            {todo.required_action_type === 'LLM_RETRY_OR_FIX' && (
              <div className="flex-1 text-sm text-gray-400">
                Provide hints/context for retry, or approve retry:
                <input 
                  type="text" 
                  placeholder="Optional context..." 
                  className="w-full mt-1 bg-gray-900 border border-gray-600 rounded px-3 py-1 text-[var(--color-foreground)] text-sm focus:border-blue-500 outline-none"
                  value={resolutionInputs[todo.id] || ''}
                  onChange={(e) => setResolutionInputs({...resolutionInputs, [todo.id]: e.target.value})}
                />
              </div>
            )}

            {todo.required_action_type === 'APPROVE_BOOLEAN' && (
              <div className="flex-1 text-sm text-gray-400">
                Requires explicit human authorization to proceed.
              </div>
            )}

            <button 
              onClick={() => handleResolve(todo.id, todo.required_action_type)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow transition-colors text-sm whitespace-nowrap"
            >
              Resolve & Re-queue
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
