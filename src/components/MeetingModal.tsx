import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Users, Loader2, Save, Pencil, Trash2, Paperclip, ExternalLink, FileText, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { useMeetingStore } from '../store/useMeetingStore';

interface MeetingModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: any; // To support editing or pre-filling from document
}

export const MeetingModal: React.FC<MeetingModalProps> = ({ isOpen, onClose, initialData }) => {
    const { user: currentUser } = useAuthStore();
    const { users, fetchUsers } = useUserStore();
    const { addMeeting, updateMeeting, deleteMeeting } = useMeetingStore();

    const [isSaving, setIsSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        date: new Date().toISOString().split('T')[0],
        startTime: '08:00',
        endTime: '09:00',
        location: '',
        participants: [] as string[],
        description: '',
        documentId: '',
        locationType: 'internal' as 'maur' | 'internal' | 'external',
        attachmentUrl: '',
        attachmentName: ''
    });
    const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

    useEffect(() => {
        if (isOpen) {
            const unsub = fetchUsers();
            return unsub;
        }
    }, [isOpen, fetchUsers]);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData(prev => ({
                    ...prev,
                    ...initialData
                }));
                // Nếu có id → chế độ xem chi tiết, chưa có → tạo mới (edit ngay)
                setIsEditing(!initialData.id);
            } else {
                // Reset to default when creating new
                setFormData({
                    title: '',
                    date: new Date().toISOString().split('T')[0],
                    startTime: '08:00',
                    endTime: '09:00',
                    location: '',
                    participants: [] as string[],
                    description: '',
                    documentId: '',
                    locationType: 'internal',
                    attachmentUrl: '',
                    attachmentName: ''
                });
                setAttachmentFile(null);
                setIsEditing(true);
            }
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const isExistingMeeting = !!initialData?.id;

    const handleSubmit = async () => {
        if (!currentUser) return;
        if (!formData.title) return;

        setIsSaving(true);
        try {
            let finalData = { ...formData };

            // Upload file đính kèm nếu có file mới
            if (attachmentFile) {
                const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
                const { storage } = await import('../firebase/config');
                const fileRef = ref(storage, `meeting-attachments/${Date.now()}_${attachmentFile.name}`);
                await uploadBytes(fileRef, attachmentFile);
                const downloadUrl = await getDownloadURL(fileRef);
                finalData.attachmentUrl = downloadUrl;
                finalData.attachmentName = attachmentFile.name;
                finalData.attachmentName = attachmentFile.name;
            }

            if (isExistingMeeting) {
                await updateMeeting(initialData.id, finalData);
                toast.success('Cập nhật lịch họp thành công!');
            } else {
                await addMeeting({
                    ...finalData,
                    creatorId: currentUser.uid
                });
                toast.success('Tạo lịch họp thành công!');
            }
            onClose();
        } catch (error) {
            console.error('Lỗi khi lưu lịch họp:', error);
            toast.error('Có lỗi xảy ra khi lưu lịch họp. Vui lòng thử lại.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!isExistingMeeting) return;
        if (!window.confirm('Bạn có chắc muốn xóa cuộc họp này?')) return;

        try {
            await deleteMeeting(initialData.id);
            toast.success('Đã xóa cuộc họp thành công!');
            onClose();
        } catch (error) {
            toast.error('Lỗi khi xóa cuộc họp.');
        }
    };

    const toggleParticipant = (uid: string) => {
        setFormData(prev => ({
            ...prev,
            participants: prev.participants.includes(uid)
                ? prev.participants.filter(id => id !== uid)
                : [...prev.participants, uid]
        }));
    };

    const getLocationLabel = (type?: string) => {
        if (type === 'internal') return 'Nội bộ Ban HTKT';
        if (type === 'maur') return 'Tại Ban MAUR';
        if (type === 'external') return 'Cơ quan khác (Bên ngoài)';
        return 'Chưa xác định';
    };

    const getLocationColor = (type?: string) => {
        if (type === 'internal') return 'bg-blue-50 text-blue-700 border-blue-200';
        if (type === 'maur') return 'bg-amber-50 text-amber-700 border-amber-200';
        if (type === 'external') return 'bg-purple-50 text-purple-700 border-purple-200';
        return 'bg-gray-50 text-gray-700 border-gray-200';
    };

    const formatDateVN = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
            return `${days[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        } catch {
            return dateStr;
        }
    };

    // ====== CHẾ ĐỘ XEM CHI TIẾT (READ-ONLY) ======
    const renderDetailView = () => (
        <div className="flex-1 overflow-y-auto">
            {/* Hero section */}
            <div className="px-6 pt-6 pb-4">
                <h2 className="text-xl font-bold text-gray-900 leading-snug">{formData.title || '(Chưa có tiêu đề)'}</h2>
            </div>

            <div className="px-6 space-y-5 pb-6">
                {/* Ngày & Giờ */}
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-900">{formatDateVN(formData.date)}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                            <Clock className="w-3.5 h-3.5 inline mr-1" />
                            {formData.startTime} – {formData.endTime}
                        </p>
                    </div>
                </div>

                {/* Địa điểm */}
                {formData.location && (
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-5 h-5 text-gray-500" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">{formData.location}</p>
                            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border mt-1 ${getLocationColor(formData.locationType)}`}>
                                {getLocationLabel(formData.locationType)}
                            </span>
                        </div>
                    </div>
                )}

                {!formData.location && (
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-5 h-5 text-gray-500" />
                        </div>
                        <div>
                            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getLocationColor(formData.locationType)}`}>
                                {getLocationLabel(formData.locationType)}
                            </span>
                        </div>
                    </div>
                )}

                {/* Thành phần tham dự */}
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                        <Users className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                            Thành phần tham dự ({formData.participants?.length || 0})
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {(formData.participants || []).map(uid => {
                                const u = users.find(user => user.uid === uid);
                                if (!u) return null;
                                return (
                                    <div key={uid} className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-2.5 py-1.5 rounded-lg">
                                        <div className="w-6 h-6 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-[10px] font-bold text-amber-700">
                                            {u.hoTen?.charAt(0) || u.displayName.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-800">{u.hoTen || u.displayName}</p>
                                            <p className="text-[9px] text-gray-400 uppercase">{u.chucVu || u.role}</p>
                                        </div>
                                    </div>
                                );
                            })}
                            {(!formData.participants || formData.participants.length === 0) && (
                                <p className="text-xs text-gray-400 italic">Chưa có thành phần tham dự</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Nội dung / Ghi chú */}
                {formData.description && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Nội dung / Ghi chú</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{formData.description}</p>
                    </div>
                )}

                {/* File đính kèm (Giấy mời họp) */}
                {formData.attachmentUrl && (
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                            <Paperclip className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Giấy mời họp đính kèm</p>
                            <a
                                href={formData.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors group"
                            >
                                <FileText className="w-4 h-4 text-emerald-600" />
                                <span className="text-sm font-bold text-emerald-700 group-hover:underline">
                                    {formData.attachmentName || 'Xem file đính kèm'}
                                </span>
                                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // ====== CHẾ ĐỘ CHỈNH SỬA (EDIT FORM) ======
    const renderEditForm = () => (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Tiêu đề */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Tiêu đề cuộc họp</label>
                <input
                    required
                    type="text"
                    placeholder="Ví dụ: Họp triển khai thi công Gói thầu số 5..."
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-medium text-gray-800"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Ngày */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Ngày họp</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            required
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-medium text-gray-800"
                        />
                    </div>
                </div>

                {/* Thời gian */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Bắt đầu</label>
                        <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                required
                                type="time"
                                value={formData.startTime}
                                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                                className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-medium text-gray-800 text-sm"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Kết thúc</label>
                        <div className="relative">
                            <input
                                required
                                type="time"
                                value={formData.endTime}
                                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-medium text-gray-800 text-sm"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Địa điểm */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Địa điểm</label>
                <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Phòng họp số 3, Tầng 2..."
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-medium text-gray-800"
                    />
                </div>
            </div>

            {/* Loại cuộc họp */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Loại cuộc họp</label>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { id: 'internal', name: 'Nội bộ', color: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20' },
                        { id: 'maur', name: 'Tại Ban MAUR', color: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20' },
                        { id: 'external', name: 'Cơ quan khác', color: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20' }
                    ].map(type => (
                        <button
                            key={type.id}
                            type="button"
                            onClick={() => setFormData({ ...formData, locationType: type.id as any })}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${formData.locationType === type.id
                                ? `${type.color} border-2 ring-4 scale-[1.02]`
                                : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200 hover:text-gray-500'
                                }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${formData.locationType === type.id ? 'bg-current pulse' : 'bg-gray-200'}`} />
                            {type.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Người tham gia */}
            <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" /> Thành phần tham dự ({formData.participants.length})
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1">
                    {users.map((u) => (
                        <button
                            key={u.uid}
                            type="button"
                            onClick={() => toggleParticipant(u.uid)}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${formData.participants.includes(u.uid)
                                ? 'bg-amber-50 border-amber-200 text-amber-900 shadow-sm'
                                : 'bg-white border-gray-100 text-gray-600 hover:border-gray-200'
                                }`}
                        >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${formData.participants.includes(u.uid) ? 'bg-amber-200' : 'bg-gray-100 text-gray-400'
                                }`}>
                                {u.hoTen?.charAt(0) || u.displayName.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">{u.hoTen || u.displayName}</p>
                                <p className="text-[9px] text-gray-400 truncate uppercase mt-0.5">{u.chucVu || u.role}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Nội dung / Ghi chú */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Nội dung / Ghi chú</label>
                <textarea
                    rows={3}
                    placeholder="Nội dung chi tiết cuộc họp..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-medium text-gray-800 text-sm resize-none"
                />
            </div>

            {/* File đính kèm (Giấy mời họp) */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" /> Giấy mời họp đính kèm (Tuỳ chọn)
                </label>

                {/* File đã có */}
                {(formData.attachmentUrl || attachmentFile) && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                        <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className="text-sm font-medium text-emerald-700 flex-1 truncate">
                            {attachmentFile?.name || formData.attachmentName || 'File đính kèm'}
                        </span>
                        {formData.attachmentUrl && !attachmentFile && (
                            <a href={formData.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-700">
                                <ExternalLink className="w-4 h-4" />
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setAttachmentFile(null);
                                setFormData({ ...formData, attachmentUrl: '', attachmentName: '' });
                            }}
                            className="text-red-400 hover:text-red-600 transition-colors"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Upload file mới */}
                {!formData.attachmentUrl && !attachmentFile && (
                    <div className="relative border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors cursor-pointer">
                        <input
                            type="file"
                            accept="application/pdf,image/*,.doc,.docx"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setAttachmentFile(file);
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <Paperclip className="w-6 h-6 mx-auto text-gray-300 mb-1" />
                        <p className="text-xs text-gray-400">Nhấn để chọn file giấy mời họp (PDF, Ảnh, Word...)</p>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-amber-600" />
                        {isEditing
                            ? (isExistingMeeting ? 'Chỉnh sửa Lịch họp' : 'Lên lịch họp mới')
                            : 'Chi tiết Lịch họp'
                        }
                    </h3>
                    <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body: Detail View or Edit Form */}
                {isEditing ? renderEditForm() : renderDetailView()}

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between flex-shrink-0">
                    {isEditing ? (
                        <>
                            <div>
                                {isExistingMeeting && (
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        className="px-4 py-2 text-sm font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                        <Trash2 className="w-4 h-4" /> Xóa
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isExistingMeeting) {
                                            // Quay lại chế độ xem, reset formData
                                            setFormData(prev => ({ ...prev, ...initialData }));
                                            setIsEditing(false);
                                        } else {
                                            onClose();
                                        }
                                    }}
                                    disabled={isSaving}
                                    className="px-5 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSubmit(); }}
                                    disabled={isSaving || !formData.title}
                                    className="px-8 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-200 hover:bg-amber-700 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                                >
                                    {isSaving ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...</>
                                    ) : (
                                        <><Save className="w-4 h-4" /> {isExistingMeeting ? 'Lưu thay đổi' : 'Lưu Lịch họp'}</>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="px-4 py-2 text-sm font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                                <Trash2 className="w-4 h-4" /> Xóa
                            </button>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-5 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                >
                                    Đóng
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}
                                    className="px-6 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-200 hover:bg-amber-700 hover:-translate-y-0.5 transition-all active:scale-95 flex items-center gap-2"
                                >
                                    <Pencil className="w-4 h-4" /> Chỉnh sửa
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
