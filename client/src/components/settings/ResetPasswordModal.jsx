import React from 'react';
import { Lock } from 'lucide-react';

export default function ResetPasswordModal({
  isOpen,
  onClose,
  userName,
  newPassword,
  onChangePassword,
  onSubmit
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Reset Password</h3>
            <p className="text-xs text-gray-400 font-medium">For user: <span className="text-gray-700 font-bold">{userName}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">New Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="password" required
                placeholder="Min. 6 characters"
                value={newPassword}
                onChange={(e) => onChangePassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
            <button type="submit" className="px-6 py-2.5 text-sm font-bold text-white bg-primary hover:bg-[#C94E16] rounded-xl shadow-lg shadow-orange-100 transition-all active:scale-95">Reset Now</button>
          </div>
        </form>
      </div>
    </div>
  );
}
