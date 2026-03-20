"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  Clock, UserX, Home, Coffee, BarChart3, Plus, Trash2,
  Download, CalendarDays, StickyNote, AlertTriangle,
  CalendarOff, Search, Sun, Moon, Users, CheckCircle2,
  XCircle, Laptop, TrendingUp, ChevronLeft, ChevronRight,
  Filter
} from "lucide-react";
import { format, isBefore, parse, getDaysInMonth, startOfMonth, getDay, isToday, parseISO } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type AttendanceStatus = "On Time" | "Late" | "Absent" | "WFH" | "Leave" | "Late Start Request" | "Holiday";

interface Employee {
  id: string;
  name: string;
  department: string;
  totalLeaves: number;
  remainingLeaves: number;
}

interface AttendanceRecord {
  date: string;
  employeeId: string;
  status: AttendanceStatus;
  inTime: string;
  note: string;
  lateReason: string;
}

interface Holiday {
  date: string;
  name: string;
}

type ViewMode = "daily" | "calendar" | "summary";

// ─── Storage Helpers ──────────────────────────────────────────────────────────
function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const item = window.localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch { return fallback; }
}
function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_EMPLOYEES: Employee[] = [
  { id: "1", name: "Alice Johnson", department: "Engineering", totalLeaves: 20, remainingLeaves: 18 },
  { id: "2", name: "Bob Smith", department: "Marketing", totalLeaves: 20, remainingLeaves: 20 },
];

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  "On Time":            "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Late":               "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "Absent":             "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  "WFH":                "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "Leave":              "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "Late Start Request": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "Holiday":            "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const STATUS_DOT: Record<AttendanceStatus, string> = {
  "On Time": "bg-emerald-500", "Late": "bg-rose-500", "Absent": "bg-gray-400",
  "WFH": "bg-sky-500", "Leave": "bg-amber-500",
  "Late Start Request": "bg-orange-500", "Holiday": "bg-purple-500",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HRDashboard() {
  const [employees, setEmployees] = useState<Employee[]>(DEFAULT_EMPLOYEES);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [lateLimit, setLateLimit] = useState("09:00");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isHydrated, setIsHydrated] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [calendarEmpId, setCalendarEmpId] = useState<string>("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Modals
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpDept, setNewEmpDept] = useState("");
  const [newEmpLeaves, setNewEmpLeaves] = useState("20");

  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");

  const [noteModal, setNoteModal] = useState<{ empId: string; field: "note" | "lateReason" } | null>(null);
  const [noteValue, setNoteValue] = useState("");

  // ─── Hydration ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setRecords(loadFromStorage<AttendanceRecord[]>("hr_records_v2", []));
    setEmployees(loadFromStorage<Employee[]>("hr_employees_v2", DEFAULT_EMPLOYEES));
    setHolidays(loadFromStorage<Holiday[]>("hr_holidays", []));
    setDarkMode(loadFromStorage<boolean>("hr_darkmode", false));
    setIsHydrated(true);
  }, []);

  useEffect(() => { if (isHydrated) saveToStorage("hr_records_v2", records); }, [records, isHydrated]);
  useEffect(() => { if (isHydrated) saveToStorage("hr_employees_v2", employees); }, [employees, isHydrated]);
  useEffect(() => { if (isHydrated) saveToStorage("hr_holidays", holidays); }, [holidays, isHydrated]);
  useEffect(() => { if (isHydrated) saveToStorage("hr_darkmode", darkMode); }, [darkMode, isHydrated]);

  useEffect(() => {
    if (employees.length > 0 && !calendarEmpId) setCalendarEmpId(employees[0].id);
  }, [employees, calendarEmpId]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const isHoliday = (date: string) => holidays.some(h => h.date === date);
  const getHolidayName = (date: string) => holidays.find(h => h.date === date)?.name || "";

  const departments = useMemo(() => {
    const depts = Array.from(new Set(employees.map(e => e.department)));
    return ["All", ...depts];
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = deptFilter === "All" || emp.department === deptFilter;
      return matchSearch && matchDept;
    });
  }, [employees, searchQuery, deptFilter]);

  const todayStats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const todayRecords = records.filter(r => r.date === today);
    return {
      present: todayRecords.filter(r => r.status === "On Time" || r.status === "Late Start Request").length,
      late: todayRecords.filter(r => r.status === "Late").length,
      wfh: todayRecords.filter(r => r.status === "WFH").length,
      absent: todayRecords.filter(r => r.status === "Absent").length,
      onLeave: todayRecords.filter(r => r.status === "Leave").length,
      total: employees.length,
    };
  }, [records, employees]);

  // ─── Attendance Handler ─────────────────────────────────────────────────────
  const handleAttendanceEntry = (
    empId: string, inTime: string,
    statusOverride?: AttendanceStatus,
    note?: string, lateReason?: string
  ) => {
    if (!statusOverride && !inTime) return;

    const holidayOnDate = isHoliday(selectedDate);
    let finalStatus: AttendanceStatus = holidayOnDate ? "Holiday" : "On Time";

    if (statusOverride) {
      finalStatus = statusOverride;
    } else if (!holidayOnDate) {
      const limit = parse(lateLimit, "HH:mm", new Date());
      const entry = parse(inTime, "HH:mm", new Date());
      if (isNaN(entry.getTime())) return;
      finalStatus = isBefore(entry, limit) || inTime === lateLimit ? "On Time" : "Late";
    }

    const existingRecord = records.find(r => r.date === selectedDate && r.employeeId === empId);
    const previousStatus = existingRecord?.status;

    const newRecord: AttendanceRecord = {
      date: selectedDate, employeeId: empId, status: finalStatus, inTime,
      note: note ?? existingRecord?.note ?? "",
      lateReason: lateReason ?? existingRecord?.lateReason ?? "",
    };

    setRecords(prev => [
      ...prev.filter(r => !(r.date === selectedDate && r.employeeId === empId)),
      newRecord,
    ]);

    const isNowLeave = finalStatus === "Leave";
    const wasLeave = previousStatus === "Leave";
    if (isNowLeave && !wasLeave) {
      setEmployees(prev => prev.map(emp =>
        emp.id === empId ? { ...emp, remainingLeaves: Math.max(0, emp.remainingLeaves - 1) } : emp
      ));
    } else if (!isNowLeave && wasLeave) {
      setEmployees(prev => prev.map(emp =>
        emp.id === empId ? { ...emp, remainingLeaves: Math.min(emp.totalLeaves, emp.remainingLeaves + 1) } : emp
      ));
    }
  };

  const getSummary = (empId: string) => {
    const empRecords = records.filter(r => r.employeeId === empId);
    return {
      onTime: empRecords.filter(r => r.status === "On Time").length,
      late: empRecords.filter(r => r.status === "Late").length,
      leave: empRecords.filter(r => r.status === "Leave").length,
      wfh: empRecords.filter(r => r.status === "WFH").length,
      absent: empRecords.filter(r => r.status === "Absent").length,
    };
  };

  // ─── Add Employee ───────────────────────────────────────────────────────────
  const addEmployee = () => {
    if (!newEmpName.trim()) return;
    const newEmp: Employee = {
      id: Date.now().toString(),
      name: newEmpName.trim(),
      department: newEmpDept.trim() || "General",
      totalLeaves: parseInt(newEmpLeaves) || 20,
      remainingLeaves: parseInt(newEmpLeaves) || 20,
    };
    setEmployees(prev => [...prev, newEmp]);
    setNewEmpName(""); setNewEmpDept(""); setNewEmpLeaves("20");
    setShowAddEmp(false);
  };

  const removeEmployee = (id: string) => {
    if (!confirm("Remove this employee? Their attendance records will remain.")) return;
    setEmployees(prev => prev.filter(e => e.id !== id));
  };

  // ─── Holidays ───────────────────────────────────────────────────────────────
  const addHoliday = () => {
    if (!newHolidayDate || !newHolidayName.trim()) return;
    setHolidays(prev => [
      ...prev.filter(h => h.date !== newHolidayDate),
      { date: newHolidayDate, name: newHolidayName.trim() }
    ]);
    setNewHolidayDate(""); setNewHolidayName("");
    setShowAddHoliday(false);
  };
  const removeHoliday = (date: string) => setHolidays(prev => prev.filter(h => h.date !== date));

  // ─── Export CSV ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [["Date", "Employee", "Department", "Status", "In Time", "Note", "Late Reason"]];
    records.forEach(r => {
      const emp = employees.find(e => e.id === r.employeeId);
      rows.push([r.date, emp?.name || "", emp?.department || "", r.status, r.inTime, r.note, r.lateReason]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "attendance_export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Calendar Sub-Component ─────────────────────────────────────────────────
  const CalendarView = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const daysInMonth = getDaysInMonth(calendarMonth);
    const firstDay = getDay(startOfMonth(calendarMonth));

    const getCellStatus = (day: number): AttendanceStatus | null => {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isHoliday(dateStr)) return "Holiday";
      const rec = records.find(r => r.date === dateStr && r.employeeId === calendarEmpId);
      return rec?.status || null;
    };

    return (
      <div className={`rounded-2xl shadow-lg p-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <select value={calendarEmpId} onChange={e => setCalendarEmpId(e.target.value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium border ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`}>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}
              className={`p-2 rounded-lg transition-all ${darkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-600"}`}>
              <ChevronLeft size={18} />
            </button>
            <span className={`font-semibold text-lg w-40 text-center ${darkMode ? "text-white" : "text-gray-800"}`}>
              {format(calendarMonth, "MMMM yyyy")}
            </span>
            <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}
              className={`p-2 rounded-lg transition-all ${darkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-600"}`}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className={`text-center text-xs font-semibold py-1 ${darkMode ? "text-gray-400" : "text-gray-400"}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const status = getCellStatus(day);
            const isCurrentDay = isToday(parseISO(dateStr));
            return (
              <div key={day} onClick={() => { setSelectedDate(dateStr); setViewMode("daily"); }}
                className={`relative aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 text-xs font-bold
                  ${isCurrentDay ? "ring-2 ring-blue-500" : ""}
                  ${status ? STATUS_STYLES[status] : darkMode ? "bg-gray-700 text-gray-400 hover:bg-gray-600" : "bg-gray-50 text-gray-400 hover:bg-gray-100"}
                `}>
                {day}
                {status && <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${STATUS_DOT[status]}`} />}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
          {(Object.entries(STATUS_DOT) as [AttendanceStatus, string][]).map(([status, dot]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Loading shell ──────────────────────────────────────────────────────────
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading dashboard…</p>
      </div>
    );
  }

  const holidayToday = isHoliday(selectedDate);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-gray-900 text-white" : "bg-slate-50 text-gray-900"}`}>

      {/* ── Top Nav ─────────────────────────────────────────────────────────── */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-sm ${darkMode ? "bg-gray-900/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Users size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">ANTS Drone Hub - HR Dashboard</h1>
              <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Attendance & Leave Management</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Toggle */}
            <div className={`flex rounded-lg p-1 gap-1 ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
              {([
                ["daily", "Daily", Clock],
                ["calendar", "Calendar", CalendarDays],
                ["summary", "Summary", BarChart3],
              ] as const).map(([mode, label, Icon]) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                    ${viewMode === mode ? "bg-blue-600 text-white shadow-sm" : darkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-800"}`}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>

            <button onClick={exportCSV}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${darkMode ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
              <Download size={13} /> Export CSV
            </button>

            <button onClick={() => setShowAddHoliday(true)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${darkMode ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
              <CalendarOff size={13} /> Holiday
            </button>

            <button onClick={() => setDarkMode(d => !d)}
              className={`p-2 rounded-lg transition-all ${darkMode ? "bg-gray-800 hover:bg-gray-700 text-yellow-400" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Today Stats Bar ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total", value: todayStats.total, icon: Users, color: "text-blue-600", bg: darkMode ? "bg-blue-900/20" : "bg-blue-50" },
            { label: "Present", value: todayStats.present, icon: CheckCircle2, color: "text-emerald-600", bg: darkMode ? "bg-emerald-900/20" : "bg-emerald-50" },
            { label: "Late", value: todayStats.late, icon: Clock, color: "text-rose-600", bg: darkMode ? "bg-rose-900/20" : "bg-rose-50" },
            { label: "WFH", value: todayStats.wfh, icon: Laptop, color: "text-sky-600", bg: darkMode ? "bg-sky-900/20" : "bg-sky-50" },
            { label: "On Leave", value: todayStats.onLeave, icon: XCircle, color: "text-amber-600", bg: darkMode ? "bg-amber-900/20" : "bg-amber-50" },
            { label: "Absent", value: todayStats.absent, icon: AlertTriangle, color: "text-gray-500", bg: darkMode ? "bg-gray-800" : "bg-gray-100" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`rounded-xl p-4 ${bg} flex items-center gap-3`}>
              <Icon size={20} className={color} />
              <div>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Calendar View ────────────────────────────────────────────────── */}
        {viewMode === "calendar" && <CalendarView />}

        {/* ── Summary View ─────────────────────────────────────────────────── */}
        {viewMode === "summary" && (
          <div className={`rounded-2xl shadow-lg p-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
              <TrendingUp size={18} className="text-purple-500" /> All-Time Summary
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b text-xs uppercase tracking-wide ${darkMode ? "border-gray-700 text-gray-400" : "border-gray-100 text-gray-400"}`}>
                    <th className="py-3 text-left">Employee</th>
                    <th className="py-3 text-left">Dept</th>
                    <th className="py-3 text-center">On Time</th>
                    <th className="py-3 text-center">Late</th>
                    <th className="py-3 text-center">WFH</th>
                    <th className="py-3 text-center">Leave</th>
                    <th className="py-3 text-center">Absent</th>
                    <th className="py-3 text-center">Leaves Left</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const s = getSummary(emp.id);
                    return (
                      <tr key={emp.id} className={`border-b last:border-0 ${darkMode ? "border-gray-700" : "border-gray-50"}`}>
                        <td className="py-3 font-medium">{emp.name}</td>
                        <td className={`py-3 text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{emp.department}</td>
                        <td className="py-3 text-center text-emerald-600 font-semibold">{s.onTime}</td>
                        <td className="py-3 text-center text-rose-600 font-semibold">{s.late}</td>
                        <td className="py-3 text-center text-sky-600 font-semibold">{s.wfh}</td>
                        <td className="py-3 text-center text-amber-600 font-semibold">{s.leave}</td>
                        <td className="py-3 text-center text-gray-500 font-semibold">{s.absent}</td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${emp.remainingLeaves <= 3 ? "bg-rose-100 text-rose-700" : darkMode ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-700"}`}>
                            {emp.remainingLeaves}/{emp.totalLeaves}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Daily Entry View ──────────────────────────────────────────────── */}
        {viewMode === "daily" && (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

            {/* Main Table */}
            <div className={`xl:col-span-3 rounded-2xl shadow-lg p-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Clock size={16} className="text-blue-500" /> Daily Entry
                  </h2>
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    className={`rounded-lg px-2 py-1 text-sm border ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`} />
                  {holidayToday && (
                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                      🎉 {getHolidayName(selectedDate)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className={`text-xs font-medium ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Late after</label>
                    <input type="time" value={lateLimit} onChange={e => setLateLimit(e.target.value)}
                      className={`rounded-lg px-2 py-1 text-sm border ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`} />
                  </div>
                  <button onClick={() => setShowAddEmp(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all">
                    <Plus size={13} /> Add Employee
                  </button>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="flex gap-3 mb-4">
                <div className={`flex items-center gap-2 flex-1 rounded-lg px-3 py-2 border text-sm ${darkMode ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"}`}>
                  <Search size={14} className="text-gray-400" />
                  <input placeholder="Search employee…" value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-transparent outline-none w-full text-sm" />
                </div>
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`}>
                  <Filter size={14} className="text-gray-400" />
                  <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                    className="bg-transparent outline-none text-sm">
                    {departments.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b text-xs uppercase tracking-wide ${darkMode ? "border-gray-700 text-gray-400" : "border-gray-100 text-gray-400"}`}>
                      <th className="py-3 text-left">Employee</th>
                      <th className="py-3 text-left">Dept</th>
                      <th className="py-3 text-center">In-Time</th>
                      <th className="py-3 text-center">Quick Mark</th>
                      <th className="py-3 text-center">Remarks</th>
                      <th className="py-3 text-center">Status</th>
                      <th className="py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map(emp => {
                      const dayRecord = records.find(r => r.date === selectedDate && r.employeeId === emp.id);
                      return (
                        <tr key={emp.id} className={`border-b last:border-0 ${darkMode ? "border-gray-700" : "border-gray-50"}`}>
                          <td className="py-3 font-medium">{emp.name}</td>
                          <td className={`py-3 text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{emp.department}</td>
                          <td className="py-3 text-center">
                            <input type="time"
                              value={dayRecord?.inTime || ""}
                              onChange={e => { if (e.target.value) handleAttendanceEntry(emp.id, e.target.value); }}
                              className={`rounded-lg px-2 py-1 text-xs border w-28 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`} />
                          </td>
                          <td className="py-3">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleAttendanceEntry(emp.id, "00:00", "WFH")} title="WFH"
                                className={`p-1.5 rounded-lg transition-all hover:scale-110 ${darkMode ? "hover:bg-sky-900/40 text-sky-400" : "hover:bg-sky-50 text-sky-600"}`}>
                                <Home size={15} />
                              </button>
                              <button onClick={() => handleAttendanceEntry(emp.id, "00:00", "Leave")} title="Leave"
                                className={`p-1.5 rounded-lg transition-all hover:scale-110 ${darkMode ? "hover:bg-amber-900/40 text-amber-400" : "hover:bg-amber-50 text-amber-600"}`}>
                                <UserX size={15} />
                              </button>
                              <button onClick={() => handleAttendanceEntry(emp.id, "00:00", "Absent")} title="Absent"
                                className={`p-1.5 rounded-lg transition-all hover:scale-110 ${darkMode ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                                <XCircle size={15} />
                              </button>
                              <button onClick={() => handleAttendanceEntry(emp.id, "00:00", "Late Start Request")} title="Late Start"
                                className={`p-1.5 rounded-lg transition-all hover:scale-110 ${darkMode ? "hover:bg-orange-900/40 text-orange-400" : "hover:bg-orange-50 text-orange-600"}`}>
                                <Coffee size={15} />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button title={dayRecord?.note || "Add note"}
                                onClick={() => { setNoteModal({ empId: emp.id, field: "note" }); setNoteValue(dayRecord?.note || ""); }}
                                className={`p-1.5 rounded-lg transition-all ${dayRecord?.note ? "text-blue-500" : darkMode ? "text-gray-600 hover:text-gray-400" : "text-gray-300 hover:text-gray-500"}`}>
                                <StickyNote size={15} />
                              </button>
                              {(dayRecord?.status === "Late" || dayRecord?.status === "Late Start Request") && (
                                <button title={dayRecord?.lateReason || "Add late reason"}
                                  onClick={() => { setNoteModal({ empId: emp.id, field: "lateReason" }); setNoteValue(dayRecord?.lateReason || ""); }}
                                  className={`p-1.5 rounded-lg transition-all ${dayRecord?.lateReason ? "text-orange-500" : darkMode ? "text-gray-600 hover:text-gray-400" : "text-gray-300 hover:text-gray-500"}`}>
                                  <AlertTriangle size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${dayRecord ? STATUS_STYLES[dayRecord.status] : darkMode ? "bg-gray-700 text-gray-500" : "bg-gray-100 text-gray-400"}`}>
                              {dayRecord?.status || "No Entry"}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <button onClick={() => removeEmployee(emp.id)} title="Remove employee"
                              className={`p-1.5 rounded-lg transition-all ${darkMode ? "text-gray-700 hover:bg-rose-900/30 hover:text-rose-400" : "text-gray-200 hover:bg-rose-50 hover:text-rose-500"}`}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredEmployees.length === 0 && (
                      <tr>
                        <td colSpan={7} className={`text-center py-10 text-sm ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                          No employees match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Side Panel */}
            <div className="space-y-4">
              {/* Leave Balances */}
              <div className={`rounded-2xl shadow-lg p-5 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 size={14} className="text-purple-500" /> Leave Balances
                </h3>
                <div className="space-y-4">
                  {employees.map(emp => {
                    const pct = (emp.remainingLeaves / emp.totalLeaves) * 100;
                    return (
                      <div key={emp.id}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className={`font-medium truncate max-w-[120px] ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{emp.name}</span>
                          <span className={`font-bold tabular-nums ${emp.remainingLeaves <= 3 ? "text-rose-500" : darkMode ? "text-gray-300" : "text-gray-600"}`}>
                            {emp.remainingLeaves}/{emp.totalLeaves}
                          </span>
                        </div>
                        <div className={`h-1.5 rounded-full ${darkMode ? "bg-gray-700" : "bg-gray-100"}`}>
                          <div className={`h-1.5 rounded-full transition-all duration-500 ${pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-rose-500"}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Holidays */}
              <div className={`rounded-2xl shadow-lg p-5 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <CalendarOff size={14} className="text-purple-500" /> Public Holidays
                </h3>
                {holidays.length === 0 && (
                  <p className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>No holidays added yet.</p>
                )}
                <div className="space-y-2.5">
                  {holidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => (
                    <div key={h.date} className="flex items-center justify-between">
                      <div>
                        <div className={`text-xs font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{h.name}</div>
                        <div className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{h.date}</div>
                      </div>
                      <button onClick={() => removeHoliday(h.date)}
                        className={`transition-colors ${darkMode ? "text-gray-600 hover:text-rose-400" : "text-gray-300 hover:text-rose-500"}`}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Employee Modal ───────────────────────────────────────────────── */}
      {showAddEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h3 className="text-base font-bold mb-4">Add New Employee</h3>
            <div className="space-y-3">
              <div>
                <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Full Name *</label>
                <input value={newEmpName} onChange={e => setNewEmpName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addEmployee()}
                  placeholder="e.g. Sarah Connor"
                  className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
              </div>
              <div>
                <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Department</label>
                <input value={newEmpDept} onChange={e => setNewEmpDept(e.target.value)}
                  placeholder="e.g. Engineering"
                  className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
              </div>
              <div>
                <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Total Leaves / Year</label>
                <input type="number" value={newEmpLeaves} onChange={e => setNewEmpLeaves(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAddEmp(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}>
                Cancel
              </button>
              <button onClick={addEmployee}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-all">
                Add Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Holiday Modal ────────────────────────────────────────────────── */}
      {showAddHoliday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h3 className="text-base font-bold mb-4">Add Public Holiday</h3>
            <div className="space-y-3">
              <div>
                <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Date *</label>
                <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-purple-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
              </div>
              <div>
                <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Holiday Name *</label>
                <input value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addHoliday()}
                  placeholder="e.g. Eid ul-Fitr"
                  className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-purple-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAddHoliday(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}>
                Cancel
              </button>
              <button onClick={addHoliday}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition-all">
                Add Holiday
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Note / Late Reason Modal ─────────────────────────────────────────── */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <h3 className="text-base font-bold mb-1">
              {noteModal.field === "note" ? "📝 Add Note" : "⚠️ Late Arrival Reason"}
            </h3>
            <p className={`text-xs mb-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              {employees.find(e => e.id === noteModal.empId)?.name} · {selectedDate}
            </p>
            <textarea value={noteValue} onChange={e => setNoteValue(e.target.value)} rows={3}
              placeholder={noteModal.field === "note" ? "e.g. Client visit, Doctor's appointment…" : "e.g. Traffic, Medical appointment…"}
              className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 resize-none ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setNoteModal(null)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}>
                Cancel
              </button>
              <button onClick={() => {
                const rec = records.find(r => r.date === selectedDate && r.employeeId === noteModal.empId);
                if (rec) {
                  setRecords(prev => prev.map(r =>
                    r.date === selectedDate && r.employeeId === noteModal.empId
                      ? { ...r, [noteModal.field]: noteValue }
                      : r
                  ));
                }
                setNoteModal(null);
              }}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-all">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
