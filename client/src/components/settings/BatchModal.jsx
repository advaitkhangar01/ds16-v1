import React from 'react';

export default function BatchModal({
  isOpen,
  onClose,
  isEdit = false,
  batchData,
  setBatchData,
  onSubmit
}) {
  if (!isOpen || !batchData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Attendance Batch' : 'Create Attendance Batch'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Batch Name</label>
            <input 
              type="text" required
              value={batchData.name || ''}
              onChange={(e) => setBatchData({ ...batchData, name: e.target.value })}
              placeholder="e.g. 9 AM Shift"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Office Start Time</label>
              <input 
                type="time" required
                value={batchData.office_start_time || ''}
                onChange={(e) => setBatchData({ ...batchData, office_start_time: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Late Threshold Time</label>
              <input 
                type="time" required
                value={batchData.late_threshold_time || ''}
                onChange={(e) => setBatchData({ ...batchData, late_threshold_time: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Irregular Cutoff Time</label>
              <input 
                type="time" required
                value={batchData.half_day_cutoff_time || ''}
                onChange={(e) => setBatchData({ ...batchData, half_day_cutoff_time: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Min Working Hours</label>
              <input 
                type="number" required step="0.5" min="1" max="24"
                value={batchData.min_working_hours || ''}
                onChange={(e) => setBatchData({ ...batchData, min_working_hours: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
            <button type="submit" className="btn-primary px-8 py-2.5">{isEdit ? 'Save Changes' : 'Create Batch'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
