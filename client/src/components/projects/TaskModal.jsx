// client/src/components/projects/TaskModal.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatTimeIST, formatIST, timeAgo } from '../../utils/time';
import toast from 'react-hot-toast';

export default function TaskModal({ taskId, isOpen, onClose }) {
  const { user } = useAuth();
  const [task, setTask] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const fetchThread = useCallback(async () => {
    if (!taskId) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/tasks/${taskId}`);
      setTask(data.task);
      setParticipants(data.participants);
      setMessages(data.messages);
    } catch (err) {
      toast.error('Failed to load task discussion');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (isOpen && taskId) {
      fetchThread();
    }
  }, [isOpen, taskId, fetchThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    const msgText = newMessage.trim();
    setNewMessage(''); // Clear input immediately for UX

    // Optimistic Update
    const tempId = Date.now();
    const optimisticMsg = {
      id: tempId,
      sender_id: user.id,
      sender_name: user.name,
      sender_username: user.username,
      sender_role: user.role,
      message: msgText,
      created_at: new Date().toISOString(),
      is_optimistic: true
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setSending(true);

    try {
      const { data } = await api.post(`/tasks/${taskId}/messages`, { message: msgText });
      // Replace optimistic message with the real one
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
      
      // Update participants list dynamically if user was added
      const isParticipant = participants.some(p => p.user_id === user.id);
      if (!isParticipant) {
        setParticipants(prev => [...prev, { user_id: user.id, name: user.name, username: user.username, role: user.role }]);
      }
    } catch (err) {
      // Rollback
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(msgText); // Restore text
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      const { data } = await api.patch(`/tasks/${taskId}`, { status: newStatus });
      setTask(prev => ({ ...prev, status: data.task.status }));
      toast.success('Task status updated');
    } catch {
      toast.error('Failed to update status');
    }
  }

  // Removed handleStageChange as stage is being deprecated from tasks UI

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-100 flex flex-col w-full max-w-2xl h-[80vh] overflow-hidden transition-all transform scale-100">
        
        {/* Header */}
        {loading ? (
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="space-y-2">
              <div className="skeleton h-6 w-48 rounded" />
              <div className="skeleton h-4 w-32 rounded" />
            </div>
            <div className="skeleton h-8 w-8 rounded-full" />
          </div>
        ) : (
          <div className="p-6 border-b border-slate-100/80 bg-slate-50/50 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-[#1A1A1A] tracking-tight">{task?.title}</h2>
                <div className="flex flex-col gap-0.5 mt-1">
                  <p className="text-xs text-muted font-medium">Project: {task?.project_name}</p>
                  <p className="text-[10px] text-muted font-medium flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Assigned on {formatIST(task?.created_at)}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white border border-slate-100 text-slate-400 hover:text-slate-600 hover:shadow-md transition-all flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap mt-2">
              {/* Removed Stage Select as requested */}

              {/* Status Select/Badge */}
              <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                <span className="text-[10px] text-muted font-bold uppercase tracking-tight">Status:</span>
                <select
                  className="bg-transparent text-xs font-bold text-[#1A1A1A] focus:outline-none disabled:opacity-50"
                  value={task?.status}
                  disabled={user?.role !== 'admin' && (task?.status === 'review' || task?.status === 'passed')}
                  onChange={(e) => handleStatusChange(e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  {/* "done" is being phased out, but kept for legacy support if needed */}
                  {task?.status === 'done' && <option value="done">Done</option>}
                  {task?.status === 'passed' && <option value="passed">Passed</option>}
                </select>
              </div>

              {/* Admin Actions */}
              {user?.role === 'admin' && task?.status === 'review' && (
                <div className="flex items-center gap-2 ml-auto">
                  <button 
                    onClick={() => handleStatusChange('passed')}
                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm transition-all"
                  >
                    Pass Task
                  </button>
                  <button 
                    onClick={() => handleStatusChange('in_progress')}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm transition-all"
                  >
                    Reassign
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Participants Row */}
        {!loading && (
          <div className="px-6 py-2 bg-white border-b border-slate-100 flex items-center gap-2">
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Participants:</span>
            <div className="flex -space-x-2">
              {participants.map((p) => (
                <div 
                  key={p.user_id} 
                  className="w-6 h-6 rounded-full bg-slate-100 border border-white flex items-center justify-center cursor-pointer hover:z-10 hover:border-[#E05A1E] transition-all"
                  title={`${p.name} (${p.role})`}
                >
                  <span className="text-[10px] font-bold text-slate-600">
                    {p.name?.charAt(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30 scrollbar-thin">
          {loading ? (
            <div className="space-y-4">
              <div className="flex gap-3"><div className="w-8 h-8 rounded-full skeleton" /><div className="skeleton h-12 w-48 rounded-xl" /></div>
              <div className="flex gap-3 justify-end"><div className="skeleton h-12 w-64 rounded-xl" /><div className="w-8 h-8 rounded-full skeleton" /></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-40">
              <span className="text-3xl mb-2">💬</span>
              <p className="text-xs font-bold uppercase tracking-wider">No messages yet. Send a note!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex items-start gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${
                    isMe ? 'bg-[rgba(224,90,30,0.1)] border-[rgba(224,90,30,0.2)] text-[#E05A1E]' : 'bg-slate-100 border-slate-200 text-slate-600'
                  } font-bold text-xs`}>
                    {msg.sender_name?.charAt(0)}
                  </div>
                  
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-[#1A1A1A]">{msg.sender_name}</span>
                      <span className="text-[10px] text-muted opacity-60">{timeAgo(msg.created_at)}</span>
                    </div>
                    
                    <div className={`p-3 rounded-2xl text-sm ${
                      isMe 
                        ? 'bg-gradient-to-br from-[#E05A1E] to-[#C94E16] text-white shadow-md rounded-tr-none' 
                        : 'bg-white border border-slate-200/80 text-slate-800 shadow-sm rounded-tl-none'
                    } ${msg.is_optimistic ? 'opacity-70 animate-pulse' : ''} leading-relaxed`}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Block */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-white flex items-center gap-3">
          <input
            type="text"
            className="input flex-1 text-sm bg-slate-50 border border-slate-200/80 rounded-full px-4 py-3 focus:outline-none focus:border-[#E05A1E] focus:bg-white transition-all"
            placeholder={loading ? 'Loading...' : 'Write message... (use @name to mention)'}
            disabled={loading}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !newMessage.trim() || sending}
            className="w-10 h-10 rounded-full bg-[#E05A1E] hover:bg-[#C94E16] disabled:bg-slate-200 disabled:text-slate-400 text-white shadow-md flex items-center justify-center transition-all flex-shrink-0"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="rotate-45 -translate-x-0.5">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
