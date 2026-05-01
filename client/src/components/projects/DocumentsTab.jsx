// client/src/components/projects/DocumentsTab.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/client';
import { timeAgo, formatIST } from '../../utils/time';
import toast from 'react-hot-toast';

const DOCUMENT_TAGS = [
  "Adhar Card",
  "Pan Card",
  "Tax Receipt",
  "K Prata",
  "Mobile Number",
  "Email Id",
  "Final Proposal For Submission",
  "Sale Deed",
  "Layout Plan",
  "DP Plan Futala",
  "Property Card",
  "Architectural Projection",
  "Indemnity Bond",
  "Structural Stability",
  "शटिपूर्ती बंध",
  "Sanction Plan",
  "Center Line",
  "Foundation And Footing",
  "Plinth Beam",
  "Plinth Slab",
  "First Floor Slab",
  "Second Floor Slab",
  "Third Floor Slab",
  "Fourth Floor Slab",
  "Fifth Floor Slab",
  "Sixth Floor Slab",
  "Seventh Floor Slab",
  "Brick Plan",
  "Electrical",
  "Plumbing",
  "Sectional Details",
  "Elevation",
  "POP",
  "Grills And Railings",
  "Others"
];

export default function DocumentsTab({ projectId, currentUser }) {
  const [documents, setDocuments] = useState({}); // Grouped by type
  const [amounts, setAmounts] = useState({}); // tag -> amount
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [selectedType, setSelectedType] = useState('');
  const [remark, setRemark] = useState('');
  const [selectedRows, setSelectedRows] = useState({}); // type -> boolean
  const fileInputRef = useRef(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const { data } = await api.get(`/documents?project_id=${projectId}&category=document&grouped=true`);
      setDocuments(data.documents || {});
      setAmounts(data.amounts || {});
      
      // Fetch payment stages to sync checkboxes
      const { data: payData } = await api.get(`/documents/payment-stages?project_id=${projectId}`);
      const initiated = (payData.paymentStages || []).reduce((acc, stage) => {
        acc[stage.document_type] = true;
        return acc;
      }, {});
      setSelectedRows(initiated);
    } catch (err) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleAmountChange = (tag, value) => {
    setAmounts(prev => ({
      ...prev,
      [tag]: value
    }));
  };

  const handleAmountBlur = async (tag, value) => {
    try {
      await api.post('/documents/amounts', {
        project_id: projectId,
        document_type: tag,
        amount: value || null
      });
    } catch (err) {
      toast.error('Failed to save amount');
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      if (selected.size > 10 * 1024 * 1024) {
        toast.error('File exceeds 10MB limit');
        e.target.value = null;
        setFile(null);
        return;
      }
      setFile(selected);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    if (!selectedType) {
      toast.error('Please select a document type');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('category', 'document');
    formData.append('document_type', selectedType);
    if (remark.trim()) {
      formData.append('remark', remark.trim());
    }
    formData.append('file', file);

    try {
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Refresh documents
      await fetchDocuments();
      
      // Reset form
      setFile(null);
      setRemark('');
      setSelectedType('');
      if (fileInputRef.current) fileInputRef.current.value = null;
      
      toast.success('Document uploaded successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const response = await api.get(`/documents/${doc.id}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.name);
      document.body.appendChild(link);
      link.click();
      
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download document');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await api.delete(`/documents/${id}`);
      await fetchDocuments();
      toast.success('Document deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const toggleRowSelection = async (tag) => {
    const wasInitiated = !!selectedRows[tag];
    const amount = amounts[tag] || 0;

    // Optimistic update for immediate UI feedback
    setSelectedRows(prev => ({
      ...prev,
      [tag]: !wasInitiated
    }));

    try {
      if (!wasInitiated) {
        // Initiate payment stage
        await api.post('/documents/payment-stages', {
          project_id: parseInt(projectId),
          document_type: tag,
          amount: parseFloat(amount) || 0
        });
        toast.success(`Payment stage initiated for ${tag}`);
      } else {
        // Remove payment stage (only if pending)
        await api.delete('/documents/payment-stages/remove/tag', {
          data: { 
            project_id: parseInt(projectId), 
            document_type: tag 
          }
        });
        toast.success(`Payment stage removed for ${tag}`);
      }
    } catch (err) {
      // Revert state if API call fails
      setSelectedRows(prev => ({
        ...prev,
        [tag]: wasInitiated
      }));
      const errorMsg = err.response?.data?.error || 'Failed to update payment stage';
      toast.error(errorMsg);
      console.error('Payment stage toggle error:', err);
    }
  };

  const totalAmount = Object.values(amounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Upload Section */}
      <div className="card bg-gray-50/50 border-dashed border-2">
        <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Upload New Document
        </h3>
        
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted uppercase ml-1">Select Document Type</label>
              <select
                className="input w-full text-sm"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                required
              >
                <option value="">-- Select Type --</option>
                {DOCUMENT_TAGS.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted uppercase ml-1">Select File</label>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                className="w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-xs file:font-bold
                  file:bg-[#E05A1E]/10 file:text-[#E05A1E]
                  hover:file:bg-[#E05A1E]/20 transition-all
                  cursor-pointer h-[38px]"
                required
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted uppercase ml-1">Remark (Optional)</label>
              <input
                type="text"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Add a remark..."
                className="input w-full text-sm"
              />
            </div>
          </div>
          
          <div className="flex justify-end pt-2">
            <button 
              type="submit" 
              disabled={!file || !selectedType || uploading} 
              className="btn-primary"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Uploading...
                </>
              ) : 'Upload Document'}
            </button>
          </div>
        </form>
      </div>

      {/* Document Table */}
      <div className="card p-0 overflow-hidden border-[#EBEBEB]">
        <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between bg-white">
          <h3 className="text-sm font-bold text-[#1A1A1A] flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
            Document Management Matrix
          </h3>
          <div className="flex gap-2">
            <span className="badge badge-in-progress">{Object.values(documents).flat().length} Files</span>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-[#EBEBEB]">
                <th className="py-3 px-4 text-[11px] font-bold text-muted uppercase tracking-wider w-12 text-center">#</th>
                <th className="py-3 px-4 text-[11px] font-bold text-muted uppercase tracking-wider w-1/4">Document Type</th>
                <th className="py-3 px-4 text-[11px] font-bold text-muted uppercase tracking-wider w-[180px] min-w-[140px]">Amount</th>
                <th className="py-3 px-4 text-[11px] font-bold text-muted uppercase tracking-wider w-1/3">Uploaded Files</th>
                <th className="py-3 px-4 text-[11px] font-bold text-muted uppercase tracking-wider w-1/4">Remarks</th>
                <th className="py-3 px-4 text-[11px] font-bold text-muted uppercase tracking-wider w-12 text-center">✔</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBEBEB]">
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i}>
                    <td className="py-2 px-4 text-center"><div className="skeleton h-3 w-4 mx-auto rounded" /></td>
                    <td className="py-2 px-4"><div className="skeleton h-3 w-3/4 rounded" /></td>
                    <td className="py-2 px-4"><div className="skeleton h-7 w-full rounded" /></td>
                    <td className="py-2 px-4"><div className="skeleton h-3 w-full rounded" /></td>
                    <td className="py-2 px-4"><div className="skeleton h-3 w-3/4 rounded" /></td>
                    <td className="py-2 px-4"><div className="skeleton h-4 w-4 rounded mx-auto" /></td>
                  </tr>
                ))
              ) : (
                DOCUMENT_TAGS.map((tag, idx) => {
                  const files = documents[tag] || [];
                  return (
                    <tr key={tag} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="py-2 px-4 align-top text-center">
                        <span className="text-[11px] font-bold text-muted mt-2 block">{idx + 1}</span>
                      </td>
                      <td className="py-2 px-4 align-top">
                        <span className="text-sm font-medium text-[#1A1A1A] mt-1.5 block">{tag}</span>
                      </td>
                      <td className="py-2 px-4 align-top">
                        <input 
                          type="number" 
                          className="input w-full min-w-[120px] max-w-[180px] text-sm h-8" 
                          placeholder="₹ 0.00" 
                          value={amounts[tag] || ''}
                          onChange={(e) => handleAmountChange(tag, e.target.value)}
                          onBlur={(e) => handleAmountBlur(tag, e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-4 align-top">
                        <div className="flex flex-col gap-1.5">
                          {files.length > 0 ? (
                            files.map(doc => (
                              <div key={doc.id} className="min-h-[28px] flex items-center">
                                <div className="inline-flex items-center gap-2 bg-white border border-[#E0E0E0] rounded-full px-3 py-0.5 text-xs group/chip hover:border-[#E05A1E] hover:bg-orange-50/30 transition-all shadow-sm">
                                  <span className="max-w-[150px] truncate font-medium text-slate-700" title={doc.name}>{doc.name}</span>
                                  <div className="flex items-center gap-1 opacity-0 group-hover/chip:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => handleDownload(doc)}
                                      className="text-slate-400 hover:text-[#E05A1E]"
                                      title="Download"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => handleDelete(doc.id)}
                                      className="text-slate-400 hover:text-red-600"
                                      title="Delete"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-300 italic h-[28px] flex items-center">No files</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-4 align-top">
                        <div className="flex flex-col gap-1.5">
                          {files.length > 0 ? (
                            files.map(doc => (
                              <div key={doc.id} className="min-h-[28px] flex items-center text-[11px] text-gray-600">
                                {doc.remark ? (
                                  <span className="max-w-[200px] truncate" title={doc.remark}>{doc.remark}</span>
                                ) : (
                                  <span className="text-gray-300 italic">-</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-300 italic h-[28px] flex items-center">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-4 text-center align-top">
                        <div className="h-8 flex items-center justify-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={!!selectedRows[tag]}
                            onChange={() => toggleRowSelection(tag)}
                            className="w-4 h-4 rounded border-gray-300 text-[#E05A1E] focus:ring-[#E05A1E] cursor-pointer"
                            title={selectedRows[tag] ? "Payment Initiated" : "Initiate Payment Stage"}
                          />
                          {selectedRows[tag] && (
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Initiated" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-gray-50 font-bold border-t-2 border-[#EBEBEB]">
              <tr>
                <td className="py-3 px-4" colSpan={2}>
                  <div className="flex justify-end pr-4 text-[11px] uppercase tracking-wider text-muted">Total Amount</div>
                </td>
                <td className="py-3 px-4">
                  <div className="text-sm text-[#E05A1E]">
                    ₹ {totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </td>
                <td colSpan={3} className="py-3 px-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
