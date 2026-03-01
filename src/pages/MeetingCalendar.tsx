import { useState, useEffect } from 'react';
import {
    Calendar as CalendarIcon,
    Plus,
    ChevronLeft,
    ChevronRight,
    Clock,
    LayoutGrid,
    CalendarDays,
    CalendarRange,
    Calendar as CalendarYearIcon,
    CheckCircle2
} from 'lucide-react';
import { useMeetingStore } from '../store/useMeetingStore';
import { useUserStore } from '../store/useUserStore';
import { MeetingModal } from '../components/MeetingModal';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    addWeeks,
    subWeeks,
    startOfQuarter,
    endOfQuarter,
    addQuarters,
    subQuarters,
    addYears,
    subYears,
    eachMonthOfInterval,
    startOfYear,
    endOfYear
} from 'date-fns';
import { vi } from 'date-fns/locale';

type ViewType = 'week' | 'month' | 'quarter' | 'year';

export const MeetingCalendar = () => {
    const { meetings, fetchMeetings } = useMeetingStore();
    const { users, fetchUsers } = useUserStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewType, setViewType] = useState<ViewType>('month');

    useEffect(() => {
        const unsubMeetings = fetchMeetings();
        const unsubUsers = fetchUsers();
        return () => {
            unsubMeetings();
            unsubUsers();
        };
    }, [fetchMeetings, fetchUsers]);

    const handleNext = () => {
        if (viewType === 'week') setCurrentDate(addWeeks(currentDate, 1));
        else if (viewType === 'month') setCurrentDate(addMonths(currentDate, 1));
        else if (viewType === 'quarter') setCurrentDate(addQuarters(currentDate, 1));
        else if (viewType === 'year') setCurrentDate(addYears(currentDate, 1));
    };

    const handlePrev = () => {
        if (viewType === 'week') setCurrentDate(subWeeks(currentDate, 1));
        else if (viewType === 'month') setCurrentDate(subMonths(currentDate, 1));
        else if (viewType === 'quarter') setCurrentDate(subQuarters(currentDate, 1));
        else if (viewType === 'year') setCurrentDate(subYears(currentDate, 1));
    };

    const renderHeaderTitle = () => {
        if (viewType === 'week') {
            const start = startOfWeek(currentDate, { weekStartsOn: 1 });
            const end = endOfWeek(currentDate, { weekStartsOn: 1 });
            return `Tuần ${format(start, 'dd/MM')} - ${format(end, 'dd/MM/yyyy')}`;
        }
        if (viewType === 'quarter') {
            const quarter = Math.floor(currentDate.getMonth() / 3) + 1;
            return `Quý ${quarter} - Năm ${format(currentDate, 'yyyy')}`;
        }
        if (viewType === 'year') {
            return `Năm ${format(currentDate, 'yyyy')}`;
        }
        return format(currentDate, 'MMMM yyyy', { locale: vi });
    };

    const renderMeetingItem = (m: any) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const meetingDate = new Date(m.date);
        meetingDate.setHours(0, 0, 0, 0);
        const isPast = meetingDate < today;

        const typeConfig = {
            internal: 'bg-blue-50 border-blue-200 text-blue-800 hover:border-blue-400',
            maur: 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-400',
            external: 'bg-purple-50 border-purple-200 text-purple-800 hover:border-purple-400'
        };
        const activeConfig = typeConfig[m.locationType as keyof typeof typeConfig] || typeConfig.maur;

        return (
            <button
                key={m.id}
                onClick={(e) => { e.stopPropagation(); setSelectedMeeting(m); setIsModalOpen(true); }}
                className={`text-[11px] font-bold py-1.5 px-2 rounded-lg border shadow-sm transition-all text-left flex flex-col w-full ${activeConfig}`}
            >
                <div className="flex items-center gap-1 w-full">
                    {isPast && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                    <span className="truncate font-bold">{m.title}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5 w-full">
                    <span className="text-[9px] font-semibold flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> {m.startTime}
                    </span>
                    {m.locationType === 'internal' && <span className="text-[8px] font-semibold bg-blue-200/70 px-1 rounded">Nội bộ</span>}
                    {m.locationType === 'maur' && <span className="text-[8px] font-semibold bg-amber-200/70 px-1 rounded">Tại Ban</span>}
                    {m.locationType === 'external' && <span className="text-[8px] font-semibold bg-purple-200/70 px-1 rounded">Bên ngoài</span>}
                </div>
            </button>
        );
    };

    const renderWeekView = () => {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 });
        const end = endOfWeek(start, { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start, end });

        return (
            <div className="grid grid-cols-7 h-full min-h-[700px]">
                {days.map((day, idx) => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const dayMeetings = meetings.filter(m => m.date === dayStr);
                    const isToday = isSameDay(day, new Date());
                    return (
                        <div key={idx} className={`border-r border-gray-100 p-2 flex flex-col gap-2 ${isToday ? 'bg-amber-50/10' : ''}`}>
                            <div className="text-center pb-2 border-b border-gray-50">
                                <span className="text-[10px] font-bold text-gray-400 uppercase block">{format(day, 'EEEE', { locale: vi })}</span>
                                <span className={`text-lg font-black inline-flex w-8 h-8 items-center justify-center rounded-full mt-1 ${isToday ? 'bg-amber-600 text-white' : 'text-gray-700'}`}>
                                    {format(day, 'd')}
                                </span>
                            </div>
                            <div className="flex flex-col gap-2 overflow-y-auto">
                                {dayMeetings.map(renderMeetingItem)}
                                {dayMeetings.length === 0 && <span className="text-[10px] text-gray-300 text-center italic mt-4">Trống</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderMonthView = () => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
        const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
        const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

        return (
            <>
                <div className="grid grid-cols-7 bg-gray-50/30 border-b border-gray-100">
                    {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
                        <div key={day} className="py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest border-r last:border-0 border-gray-100">
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 min-h-[700px]">
                    {calendarDays.map((day, idx) => {
                        const dayStr = format(day, 'yyyy-MM-dd');
                        const dayMeetings = meetings.filter(m => m.date === dayStr);
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isToday = isSameDay(day, new Date());

                        return (
                            <div
                                key={idx}
                                onClick={() => { setSelectedMeeting({ date: format(day, 'yyyy-MM-dd') }); setIsModalOpen(true); }}
                                className={`min-h-[140px] p-2 border-r border-b border-gray-100 flex flex-col gap-1 transition-colors hover:bg-amber-50/20 group cursor-pointer ${!isCurrentMonth ? 'bg-gray-50/40' : ''
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-amber-600 text-white shadow-sm shadow-amber-200' : !isCurrentMonth ? 'text-gray-300' : 'text-gray-700'
                                        }`}>
                                        {format(day, 'd')}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 overflow-y-auto max-h-[100px] scrollbar-hide">
                                    {dayMeetings.map(renderMeetingItem)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </>
        );
    };

    const renderQuarterView = () => {
        const qStart = startOfQuarter(currentDate);
        const qEnd = endOfQuarter(qStart);
        const months = eachMonthOfInterval({ start: qStart, end: qEnd });

        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4">
                {months.map((month, mIdx) => {
                    const monthMeetings = meetings.filter(m => isSameMonth(new Date(m.date), month));
                    return (
                        <div key={mIdx} className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 flex flex-col h-[650px]">
                            <h4 className="text-sm font-bold text-gray-900 mb-4 capitalize border-b border-amber-200 pb-2 flex justify-between">
                                <span>Tháng {format(month, 'MM')}</span>
                                <span className="text-amber-600">{monthMeetings.length} cuộc họp</span>
                            </h4>
                            <div className="flex-1 overflow-y-auto space-y-3">
                                {monthMeetings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(m => {
                                    const today = new Date(); today.setHours(0, 0, 0, 0);
                                    const md = new Date(m.date); md.setHours(0, 0, 0, 0);
                                    const isPast = md < today;
                                    return (
                                        <div key={m.id} className="bg-white p-2 rounded-lg shadow-sm border border-gray-100 cursor-pointer hover:border-amber-400 transition-all" onClick={() => { setSelectedMeeting(m); setIsModalOpen(true); }}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 rounded">{format(new Date(m.date), 'dd/MM')}</span>
                                                <div className="flex items-center gap-1">
                                                    {isPast && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                                    <span className="text-[9px] text-gray-500 font-bold">{m.startTime}</span>
                                                </div>
                                            </div>
                                            <p className="text-[11px] font-bold text-gray-800 line-clamp-2">{m.title}</p>
                                        </div>
                                    );
                                })}
                                {monthMeetings.length === 0 && <p className="text-center text-xs text-gray-400 italic py-8">Không có lịch họp</p>}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderYearView = () => {
        const yearStart = startOfYear(currentDate);
        const yearEnd = endOfYear(yearStart);
        const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                {months.map((month, mIdx) => {
                    const monthMeetings = meetings.filter(m => isSameMonth(new Date(m.date), month));
                    const internalCount = monthMeetings.filter(m => m.locationType === 'internal').length;
                    const maurCount = monthMeetings.filter(m => m.locationType === 'maur').length;
                    const externalCount = monthMeetings.filter(m => m.locationType === 'external').length;
                    const totalCount = monthMeetings.length;

                    return (
                        <div
                            key={mIdx}
                            onClick={() => { setViewType('month'); setCurrentDate(month); }}
                            className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-amber-400 cursor-pointer transition-all group h-[155px] flex flex-col justify-between"
                        >
                            <h4 className="text-sm font-bold text-gray-900 capitalize group-hover:text-amber-600">Tháng {format(month, 'MM')}</h4>
                            <div className="mt-2 flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">{totalCount} cuộc họp</span>
                                    {totalCount > 0 && <div className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-200"></div>}
                                </div>
                                {totalCount > 0 && (
                                    <div className="space-y-1">
                                        {internalCount > 0 && (
                                            <div className="flex items-center justify-between text-[10px] text-gray-600">
                                                <span className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500" /> Nội bộ
                                                </span>
                                                <span>{internalCount}</span>
                                            </div>
                                        )}
                                        {maurCount > 0 && (
                                            <div className="flex items-center justify-between text-[10px] text-gray-600">
                                                <span className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500" /> Tại Ban
                                                </span>
                                                <span>{maurCount}</span>
                                            </div>
                                        )}
                                        {externalCount > 0 && (
                                            <div className="flex items-center justify-between text-[10px] text-gray-600">
                                                <span className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full bg-purple-500" /> Bên ngoài
                                                </span>
                                                <span>{externalCount}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="p-6 max-w-[1700px] mx-auto min-h-screen bg-gray-50/30">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <CalendarIcon className="w-8 h-8 text-amber-600" />
                        Lịch họp Ban HTKT
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Quản lý và điều hành các cuộc họp chuyên môn</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 flex gap-1">
                        {[
                            { id: 'week', name: 'Tuần', icon: LayoutGrid },
                            { id: 'month', name: 'Tháng', icon: CalendarDays },
                            { id: 'quarter', name: 'Quý', icon: CalendarRange },
                            { id: 'year', name: 'Năm', icon: CalendarYearIcon }
                        ].map(view => (
                            <button
                                key={view.id}
                                onClick={() => setViewType(view.id as ViewType)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewType === view.id ? 'bg-amber-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'
                                    }`}
                            >
                                <view.icon className="w-3.5 h-3.5" />
                                {view.name}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => { setSelectedMeeting(null); setIsModalOpen(true); }}
                        className="flex items-center gap-2 bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-amber-200 hover:bg-amber-700 hover:-translate-y-0.5 transition-all active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Tạo cuộc họp
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-600" />
                            Sắp tới
                        </h3>
                        <div className="space-y-4">
                            {meetings
                                .filter(m => new Date(m.date) >= new Date())
                                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                .slice(0, 5)
                                .map(m => (
                                    <div key={m.id} className="group cursor-pointer" onClick={() => { setSelectedMeeting(m); setIsModalOpen(true); }}>
                                        <div className="flex gap-3">
                                            <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 flex-shrink-0">
                                                <span className="text-[10px] font-bold uppercase">{format(new Date(m.date), 'MMM', { locale: vi })}</span>
                                                <span className="text-lg font-black leading-tight">{format(new Date(m.date), 'dd')}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-bold text-gray-900 truncate group-hover:text-amber-600 transition-colors">{m.title}</h4>
                                                <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                                                    <Clock className="w-3 h-3" /> {m.startTime}
                                                </p>
                                                {/* Participants avatars */}
                                                <div className="flex -space-x-1.5 mt-1.5 overflow-hidden">
                                                    {m.participants.slice(0, 3).map(uid => {
                                                        const u = users.find(user => user.uid === uid);
                                                        if (!u) return null;
                                                        return (
                                                            <div key={uid} className="w-4 h-4 rounded-full bg-amber-100 border border-white flex items-center justify-center text-[6px] font-bold text-amber-700" title={u.hoTen || u.displayName}>
                                                                {u.hoTen?.charAt(0) || u.displayName.charAt(0)}
                                                            </div>
                                                        );
                                                    })}
                                                    {m.participants.length > 3 && (
                                                        <div className="w-4 h-4 rounded-full bg-gray-50 border border-white flex items-center justify-center text-[6px] font-bold text-gray-400">
                                                            +{m.participants.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            {meetings.length === 0 && (
                                <p className="text-xs text-center text-gray-400 py-4 italic">Chưa có lịch họp nào</p>
                            )}
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-widest text-[10px] text-gray-400">
                            Chú thích màu
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-blue-500 shadow-sm shadow-blue-200" />
                                <span className="text-[11px] font-bold text-gray-700">Nội bộ Ban HTKT</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm shadow-amber-200" />
                                <span className="text-[11px] font-bold text-gray-700">Tại Ban MAUR</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-purple-500 shadow-sm shadow-purple-200" />
                                <span className="text-[11px] font-bold text-gray-700">Cơ quan khác (Bên ngoài)</span>
                            </div>
                            <div className="border-t border-gray-100 my-2 pt-2">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    <span className="text-[11px] font-bold text-gray-700">Đã họp xong</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Calendar Content */}
                <div className="lg:col-span-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-800 capitalize">
                                {renderHeaderTitle()}
                            </h3>
                            <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1">
                                <button onClick={handlePrev} className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-500">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setCurrentDate(new Date())}
                                    className="px-3 py-1 text-xs font-bold text-amber-600 hover:bg-amber-50 rounded mx-1"
                                >
                                    Hôm nay
                                </button>
                                <button onClick={handleNext} className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-500">
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-visible">
                            {viewType === 'week' && renderWeekView()}
                            {viewType === 'month' && renderMonthView()}
                            {viewType === 'quarter' && renderQuarterView()}
                            {viewType === 'year' && renderYearView()}
                        </div>
                    </div>
                </div>
            </div>

            <MeetingModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={selectedMeeting}
            />
        </div>
    );
};
