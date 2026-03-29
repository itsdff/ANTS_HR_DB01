"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Clock, UserX, Home, Coffee, BarChart3, Plus, Trash2, Download,
  CalendarDays, StickyNote, AlertTriangle, CalendarOff, Search,
  Sun, Moon, Users, CheckCircle2, XCircle, Laptop, TrendingUp,
  ChevronLeft, ChevronRight, Filter, Edit2, Save, X, Cake,
  Phone, Mail, MapPin, Droplets, Briefcase, Hash, UserCheck,
  Upload, Bell, Building2
} from "lucide-react";
import {
  format, isBefore, parse, getDaysInMonth, startOfMonth,
  getDay, isToday, parseISO, differenceInDays, addDays
} from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type AttendanceStatus = "On Time" | "Late" | "Absent" | "WFH" | "Leave" | "Late Start Request" | "Holiday";
type MainTab = "employees" | "attendance";
type AttendanceView = "daily" | "calendar" | "summary";
type HolidayType = "public" | "company";

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  bloodGroup: string;
  phone: string;
  email: string;
  emergencyContact: string;
  presentAddress: string;
  birthday: string;
  joiningDate: string;
  cessationDate: string;
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
  type: HolidayType;
  considerAttendance: boolean;
}

// ─── Storage ──────────────────────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { }
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const EMPTY_EMP: Omit<Employee, "id"> = {
  employeeId: "", name: "", designation: "", department: "",
  bloodGroup: "", phone: "", email: "", emergencyContact: "",
  presentAddress: "", birthday: "", joiningDate: "", cessationDate: "",
  totalLeaves: 20, remainingLeaves: 20,
};

const DEFAULT_EMPLOYEES: Employee[] = [
  { id: "1", employeeId: "ANTS-001", name: "Alice Johnson", designation: "Lead Engineer", department: "Engineering", bloodGroup: "B+", phone: "01700000001", email: "alice@ants.com", emergencyContact: "01700000002", presentAddress: "Dhaka", birthday: "1995-03-15", joiningDate: "2022-01-10", cessationDate: "", totalLeaves: 20, remainingLeaves: 18 },
  { id: "2", employeeId: "ANTS-002", name: "Bob Smith", designation: "Marketing Manager", department: "Marketing", bloodGroup: "O+", phone: "01700000003", email: "bob@ants.com", emergencyContact: "01700000004", presentAddress: "Chittagong", birthday: "1990-07-22", joiningDate: "2021-06-01", cessationDate: "", totalLeaves: 20, remainingLeaves: 20 },
];

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  "On Time":            "bg-emerald-100 text-emerald-700",
  "Late":               "bg-rose-100 text-rose-700",
  "Absent":             "bg-gray-200 text-gray-600",
  "WFH":                "bg-sky-100 text-sky-700",
  "Leave":              "bg-amber-100 text-amber-700",
  "Late Start Request": "bg-orange-100 text-orange-700",
  "Holiday":            "bg-purple-100 text-purple-700",
};
const STATUS_DOT: Record<AttendanceStatus, string> = {
  "On Time": "bg-emerald-500", "Late": "bg-rose-500", "Absent": "bg-gray-400",
  "WFH": "bg-sky-500", "Leave": "bg-amber-500",
  "Late Start Request": "bg-orange-500", "Holiday": "bg-purple-500",
};
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getUpcomingBirthdays(employees: Employee[], daysAhead = 7) {
  const today = new Date(); const year = today.getFullYear();
  return employees.filter(e => {
    if (!e.birthday || e.cessationDate) return false;
    const bday = parseISO(e.birthday);
    let next = new Date(year, bday.getMonth(), bday.getDate());
    if (isBefore(next, today)) next = new Date(year + 1, bday.getMonth(), bday.getDate());
    const diff = differenceInDays(next, today);
    return diff >= 0 && diff <= daysAhead;
  }).map(e => {
    const bday = parseISO(e.birthday);
    const year2 = new Date().getFullYear();
    let next = new Date(year2, bday.getMonth(), bday.getDate());
    if (isBefore(next, today)) next = new Date(year2 + 1, bday.getMonth(), bday.getDate());
    return { ...e, daysUntil: differenceInDays(next, today) };
  });
}

function getUpcomingHolidays(holidays: Holiday[], daysAhead = 7) {
  const today = new Date();
  return holidays.filter(h => {
    const d = parseISO(h.date);
    const diff = differenceInDays(d, today);
    return diff >= 0 && diff <= daysAhead;
  }).map(h => ({ ...h, daysUntil: differenceInDays(parseISO(h.date), today) }));
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function HRDashboard() {
  const [employees, setEmployees] = useState<Employee[]>(DEFAULT_EMPLOYEES);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [lateLimit, setLateLimit] = useState("09:00");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isHydrated, setIsHydrated] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("attendance");
  const [attendanceView, setAttendanceView] = useState<AttendanceView>("daily");
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [calendarEmpId, setCalendarEmpId] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Employee form
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState<Omit<Employee, "id">>(EMPTY_EMP);

  // Holiday form
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "", type: "public" as HolidayType, considerAttendance: false });
  const [holidayWarning, setHolidayWarning] = useState<{ empId: string; date: string } | null>(null);

  // Note modal
  const [noteModal, setNoteModal] = useState<{ empId: string; field: "note" | "lateReason" } | null>(null);
  const [noteValue, setNoteValue] = useState("");

  const csvRef = useRef<HTMLInputElement>(null);

  // ─── Hydration ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setRecords(load<AttendanceRecord[]>("ants_records", []));
    setEmployees(load<Employee[]>("ants_employees", DEFAULT_EMPLOYEES));
    setHolidays(load<Holiday[]>("ants_holidays", []));
    setDarkMode(load<boolean>("ants_dark", false));
    setIsHydrated(true);
  }, []);
  useEffect(() => { if (isHydrated) save("ants_records", records); }, [records, isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_employees", employees); }, [employees, isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_holidays", holidays); }, [holidays, isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_dark", darkMode); }, [darkMode, isHydrated]);
  useEffect(() => { if (employees.length > 0 && !calendarEmpId) setCalendarEmpId(employees[0].id); }, [employees, calendarEmpId]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const activeEmployees = useMemo(() => employees.filter(e => !e.cessationDate || e.cessationDate === ""), [employees]);
  const departments = useMemo(() => ["All", ...Array.from(new Set(employees.map(e => e.department)))], [employees]);

  const filteredAttendanceEmps = useMemo(() => activeEmployees.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchDept = deptFilter === "All" || e.department === deptFilter;
    return matchSearch && matchDept;
  }), [activeEmployees, searchQuery, deptFilter]);

  const getHoliday = (date: string) => holidays.find(h => h.date === date);

  const todayStats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const tr = records.filter(r => r.date === today);
    return {
      total: activeEmployees.length,
      present: tr.filter(r => r.status === "On Time" || r.status === "Late Start Request").length,
      late: tr.filter(r => r.status === "Late").length,
      wfh: tr.filter(r => r.status === "WFH").length,
      onLeave: tr.filter(r => r.status === "Leave").length,
      absent: tr.filter(r => r.status === "Absent").length,
    };
  }, [records, activeEmployees]);

  const upcomingBirthdays = useMemo(() => getUpcomingBirthdays(activeEmployees), [activeEmployees]);
  const upcomingHolidays = useMemo(() => getUpcomingHolidays(holidays), [holidays]);

  // ─── Attendance ─────────────────────────────────────────────────────────────
  const handleAttendanceEntry = (empId: string, inTime: string, statusOverride?: AttendanceStatus) => {
    if (!statusOverride && !inTime) return;
    const holiday = getHoliday(selectedDate);

    // If holiday exists and considerAttendance is false, warn before allowing
    if (holiday && !holiday.considerAttendance && !statusOverride) {
      setHolidayWarning({ empId, date: selectedDate });
      return;
    }

    let finalStatus: AttendanceStatus = "On Time";
    if (statusOverride) {
      finalStatus = statusOverride;
    } else {
      const limit = parse(lateLimit, "HH:mm", new Date());
      const entry = parse(inTime, "HH:mm", new Date());
      if (isNaN(entry.getTime())) return;
      finalStatus = isBefore(entry, limit) || inTime === lateLimit ? "On Time" : "Late";
    }

    const existing = records.find(r => r.date === selectedDate && r.employeeId === empId);
    const wasLeave = existing?.status === "Leave";
    const isNowLeave = finalStatus === "Leave";

    setRecords(prev => [
      ...prev.filter(r => !(r.date === selectedDate && r.employeeId === empId)),
      { date: selectedDate, employeeId: empId, status: finalStatus, inTime, note: existing?.note ?? "", lateReason: existing?.lateReason ?? "" },
    ]);

    if (isNowLeave && !wasLeave) {
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, remainingLeaves: Math.max(0, e.remainingLeaves - 1) } : e));
    } else if (!isNowLeave && wasLeave) {
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, remainingLeaves: Math.min(e.totalLeaves, e.remainingLeaves + 1) } : e));
    }
  };

  const confirmHolidayOverride = () => {
    if (!holidayWarning) return;
    setHolidayWarning(null);
  };

  const getSummary = (empId: string) => {
    const er = records.filter(r => r.employeeId === empId);
    return {
      onTime: er.filter(r => r.status === "On Time").length,
      late: er.filter(r => r.status === "Late").length,
      leave: er.filter(r => r.status === "Leave").length,
      wfh: er.filter(r => r.status === "WFH").length,
      absent: er.filter(r => r.status === "Absent").length,
    };
  };

  // ─── Employee CRUD ───────────────────────────────────────────────────────────
  const openAddEmp = () => { setEditingEmp(null); setEmpForm(EMPTY_EMP); setShowEmpForm(true); };
  const openEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    const { id, ...rest } = emp; void id;
    setEmpForm(rest);
    setShowEmpForm(true);
  };
  const saveEmployee = () => {
    if (!empForm.name.trim()) return;
    if (editingEmp) {
      setEmployees(prev => prev.map(e => e.id === editingEmp.id ? { ...empForm, id: editingEmp.id } : e));
    } else {
      setEmployees(prev => [...prev, { ...empForm, id: Date.now().toString() }]);
    }
    setShowEmpForm(false);
  };
  const removeEmployee = (id: string) => {
    if (!confirm("Remove this employee? Their attendance records will remain.")) return;
    setEmployees(prev => prev.filter(e => e.id !== id));
  };

  // ─── Holidays ───────────────────────────────────────────────────────────────
  const addHoliday = () => {
    if (!newHoliday.date || !newHoliday.name.trim()) return;
    setHolidays(prev => [...prev.filter(h => h.date !== newHoliday.date), { ...newHoliday }]);
    setNewHoliday({ date: "", name: "", type: "public", considerAttendance: false });
    setShowHolidayForm(false);
  };
  const removeHoliday = (date: string) => setHolidays(prev => prev.filter(h => h.date !== date));

  // ─── CSV Upload ──────────────────────────────────────────────────────────────
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter(Boolean);
      const parsed: Holiday[] = [];
      lines.forEach(line => {
        const parts = line.split(",").map(p => p.replace(/"/g, "").trim());
        if (parts.length >= 2) {
          const [date, name, type] = parts;
          if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            parsed.push({ date, name: name || "Holiday", type: (type === "company" ? "company" : "public"), considerAttendance: false });
          }
        }
      });
      if (parsed.length > 0) {
        setHolidays(prev => {
          const map = new Map(prev.map(h => [h.date, h]));
          parsed.forEach(h => map.set(h.date, h));
          return Array.from(map.values());
        });
        alert(`✅ Imported ${parsed.length} holidays successfully.`);
      } else {
        alert("❌ No valid holidays found. Format should be: YYYY-MM-DD, Holiday Name");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ─── Export CSV ──────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [["Date", "Employee ID", "Name", "Designation", "Department", "Status", "In Time", "Note", "Late Reason"]];
    records.forEach(r => {
      const emp = employees.find(e => e.id === r.employeeId);
      rows.push([r.date, emp?.employeeId || "", emp?.name || "", emp?.designation || "", emp?.department || "", r.status, r.inTime, r.note, r.lateReason]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ants_attendance.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Calendar ───────────────────────────────────────────────────────────────
  const CalendarView = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const days = getDaysInMonth(calendarMonth);
    const firstDay = getDay(startOfMonth(calendarMonth));
    const getCellStatus = (day: number): AttendanceStatus | null => {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const h = getHoliday(ds); if (h) return "Holiday";
      return records.find(r => r.date === ds && r.employeeId === calendarEmpId)?.status || null;
    };
    return (
      <div className={`rounded-2xl shadow-lg p-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <select value={calendarEmpId} onChange={e => setCalendarEmpId(e.target.value)}
            className={`rounded-lg px-3 py-2 text-sm border ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`}>
            {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>)}
          </select>
          <div className="flex items-center gap-2">
            <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}
              className={`p-2 rounded-lg ${darkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100"}`}><ChevronLeft size={18} /></button>
            <span className={`font-semibold w-40 text-center ${darkMode ? "text-white" : ""}`}>{format(calendarMonth, "MMMM yyyy")}</span>
            <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}
              className={`p-2 rounded-lg ${darkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100"}`}><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d =>
            <div key={d} className="text-center text-xs font-semibold py-1 text-gray-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1;
            const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const status = getCellStatus(day);
            const cur = isToday(parseISO(ds));
            return (
              <div key={day} onClick={() => { setSelectedDate(ds); setAttendanceView("daily"); setMainTab("attendance"); }}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 text-xs font-bold
                  ${cur ? "ring-2 ring-blue-500" : ""}
                  ${status ? STATUS_STYLES[status] : darkMode ? "bg-gray-700 text-gray-400 hover:bg-gray-600" : "bg-gray-50 text-gray-400 hover:bg-gray-100"}`}>
                {day}
                {status && <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${STATUS_DOT[status]}`} />}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          {(Object.entries(STATUS_DOT) as [AttendanceStatus, string][]).map(([s, dot]) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Input helper ────────────────────────────────────────────────────────────
  const fi = (label: string, key: keyof Omit<Employee, "id">, type = "text", opts?: string[]) => (
    <div>
      <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{label}</label>
      {opts ? (
        <select value={empForm[key] as string} onChange={e => setEmpForm(f => ({ ...f, [key]: e.target.value }))}
          className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`}>
          <option value="">Select…</option>
          {opts.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={empForm[key] as string}
          onChange={e => setEmpForm(f => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
          className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
      )}
    </div>
  );

  if (!isHydrated) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Loading ANTS Drone Hub…</p>
    </div>
  );

  const holidayToday = getHoliday(selectedDate);

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-gray-900 text-white" : "bg-slate-50 text-gray-900"}`}>

      {/* ── Top Nav ─────────────────────────────────────────────────────────── */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-sm ${darkMode ? "bg-gray-900/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
              <Users size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none tracking-tight">ANTS Drone Hub</h1>
              <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>HR Dashboard · Attendance & Leave Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Main Tabs */}
            <div className={`flex rounded-lg p-1 gap-1 ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
              {([["employees", "Employees", Users], ["attendance", "Attendance", Clock]] as const).map(([tab, label, Icon]) => (
                <button key={tab} onClick={() => setMainTab(tab)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all
                    ${mainTab === tab ? "bg-blue-600 text-white shadow-sm" : darkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-800"}`}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>
            <button onClick={exportCSV}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${darkMode ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
              <Download size={13} /> Export CSV
            </button>
            <button onClick={() => setShowHolidayForm(true)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${darkMode ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
              <CalendarOff size={13} /> Holiday
            </button>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
            <button onClick={() => csvRef.current?.click()}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${darkMode ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
              <Upload size={13} /> Import CSV
            </button>
            <button onClick={() => setDarkMode(d => !d)}
              className={`p-2 rounded-lg ${darkMode ? "bg-gray-800 hover:bg-gray-700 text-yellow-400" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Stats Bar ───────────────────────────────────────────────────── */}
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

        {/* ══════════════════════ EMPLOYEES TAB ══════════════════════════════ */}
        {mainTab === "employees" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Users size={18} className="text-blue-500" /> Employee Profiles
                <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-500"}`}>
                  {employees.length} total · {activeEmployees.length} active
                </span>
              </h2>
              <button onClick={openAddEmp}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all">
                <Plus size={14} /> Add Employee
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {employees.map(emp => {
                const isInactive = !!emp.cessationDate;
                return (
                  <div key={emp.id} className={`rounded-2xl shadow-md p-5 border transition-all hover:shadow-lg
                    ${isInactive ? darkMode ? "bg-gray-800/50 border-gray-700 opacity-60" : "bg-gray-50 border-gray-200 opacity-70" :
                      darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white
                          ${isInactive ? "bg-gray-400" : "bg-blue-600"}`}>
                          {emp.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{emp.name}</div>
                          <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{emp.employeeId}</div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {isInactive && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">Inactive</span>}
                        <button onClick={() => openEditEmp(emp)}
                          className={`p-1.5 rounded-lg transition-all ${darkMode ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => removeEmployee(emp.id)}
                          className={`p-1.5 rounded-lg transition-all ${darkMode ? "hover:bg-rose-900/30 text-gray-600 hover:text-rose-400" : "hover:bg-rose-50 text-gray-300 hover:text-rose-500"}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Briefcase size={12} className="text-blue-400 shrink-0" />
                        <span className={`text-xs ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{emp.designation || "—"}</span>
                        <span className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>· {emp.department || "—"}</span>
                      </div>
                      {emp.phone && <div className="flex items-center gap-2">
                        <Phone size={12} className="text-emerald-400 shrink-0" />
                        <span className={`text-xs ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{emp.phone}</span>
                      </div>}
                      {emp.email && <div className="flex items-center gap-2">
                        <Mail size={12} className="text-sky-400 shrink-0" />
                        <span className={`text-xs truncate ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{emp.email}</span>
                      </div>}
                      {emp.presentAddress && <div className="flex items-center gap-2">
                        <MapPin size={12} className="text-rose-400 shrink-0" />
                        <span className={`text-xs truncate ${darkMode ? "text-gray-300" : "text-gray-600"}`}>{emp.presentAddress}</span>
                      </div>}
                      <div className="flex items-center gap-3 pt-1">
                        {emp.bloodGroup && <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${darkMode ? "bg-rose-900/30 text-rose-300" : "bg-rose-50 text-rose-600"}`}>
                          <Droplets size={10} />{emp.bloodGroup}
                        </span>}
                        {emp.birthday && <span className={`flex items-center gap-1 text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                          <Cake size={10} />{format(parseISO(emp.birthday), "dd MMM")}
                        </span>}
                      </div>
                      <div className={`flex gap-3 pt-1 text-xs border-t ${darkMode ? "border-gray-700 text-gray-400" : "border-gray-100 text-gray-500"}`}>
                        <span>Joined: {emp.joiningDate ? format(parseISO(emp.joiningDate), "dd MMM yyyy") : "—"}</span>
                        {emp.cessationDate && <span className="text-rose-500">Left: {format(parseISO(emp.cessationDate), "dd MMM yyyy")}</span>}
                      </div>
                      <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                        Leaves: <strong>{emp.remainingLeaves}</strong>/{emp.totalLeaves}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════ ATTENDANCE TAB ═════════════════════════════ */}
        {mainTab === "attendance" && (
          <div className="space-y-5">
            {/* Sub-view toggle */}
            <div className={`flex rounded-lg p-1 gap-1 w-fit ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
              {([["daily", "Daily", Clock], ["calendar", "Calendar", CalendarDays], ["summary", "Summary", BarChart3]] as const).map(([mode, label, Icon]) => (
                <button key={mode} onClick={() => setAttendanceView(mode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                    ${attendanceView === mode ? "bg-blue-600 text-white shadow-sm" : darkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-800"}`}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>

            {attendanceView === "calendar" && <CalendarView />}

            {/* Summary */}
            {attendanceView === "summary" && (
              <div className={`rounded-2xl shadow-lg p-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
                <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
                  <TrendingUp size={18} className="text-purple-500" /> All-Time Summary
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`border-b text-xs uppercase ${darkMode ? "border-gray-700 text-gray-400" : "border-gray-100 text-gray-400"}`}>
                        <th className="py-3 text-left">Employee</th>
                        <th className="py-3 text-left">Designation</th>
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
                            <td className={`py-3 text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{emp.designation}</td>
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

            {/* Daily Entry */}
            {attendanceView === "daily" && (
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Main Table */}
                <div className={`xl:col-span-3 rounded-2xl shadow-lg p-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-base font-semibold flex items-center gap-2">
                        <Clock size={16} className="text-blue-500" /> Daily Entry
                      </h2>
                      <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                        className={`rounded-lg px-2 py-1 text-sm border ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`} />
                      {holidayToday && (
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${holidayToday.type === "company" ? "bg-sky-100 text-sky-700" : "bg-purple-100 text-purple-700"}`}>
                          🎉 {holidayToday.name} {holidayToday.considerAttendance ? "(Attendance tracked)" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`text-xs font-medium ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Late after</label>
                      <input type="time" value={lateLimit} onChange={e => setLateLimit(e.target.value)}
                        className={`rounded-lg px-2 py-1 text-sm border ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`} />
                    </div>
                  </div>

                  {/* Search & Filter */}
                  <div className="flex gap-3 mb-4">
                    <div className={`flex items-center gap-2 flex-1 rounded-lg px-3 py-2 border ${darkMode ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"}`}>
                      <Search size={14} className="text-gray-400" />
                      <input placeholder="Search name or ID…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="bg-transparent outline-none w-full text-sm" />
                    </div>
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`}>
                      <Filter size={14} className="text-gray-400" />
                      <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="bg-transparent outline-none text-sm">
                        {departments.map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`border-b text-xs uppercase tracking-wide ${darkMode ? "border-gray-700 text-gray-400" : "border-gray-100 text-gray-400"}`}>
                          <th className="py-3 text-left">Employee</th>
                          <th className="py-3 text-left">Designation / Dept</th>
                          <th className="py-3 text-center">In-Time</th>
                          <th className="py-3 text-center">Quick Mark</th>
                          <th className="py-3 text-center">Remarks</th>
                          <th className="py-3 text-center">Status</th>
                          <th className="py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAttendanceEmps.map(emp => {
                          const dayRecord = records.find(r => r.date === selectedDate && r.employeeId === emp.id);
                          return (
                            <tr key={emp.id} className={`border-b last:border-0 ${darkMode ? "border-gray-700" : "border-gray-50"}`}>
                              <td className="py-3">
                                <div className="font-medium text-sm">{emp.name}</div>
                                <div className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{emp.employeeId}</div>
                              </td>
                              <td className="py-3">
                                <div className={`text-xs font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{emp.designation || "—"}</div>
                                <div className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{emp.department || "—"}</div>
                              </td>
                              <td className="py-3 text-center">
                                <input type="time"
                                  value={dayRecord?.inTime || ""}
                                  onChange={e => { if (e.target.value) handleAttendanceEntry(emp.id, e.target.value); }}
                                  className={`rounded-lg px-2 py-1 text-xs border w-28 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"}`} />
                              </td>
                              <td className="py-3">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => handleAttendanceEntry(emp.id, "00:00", "WFH")} title="WFH"
                                    className={`p-1.5 rounded-lg hover:scale-110 transition-all ${darkMode ? "hover:bg-sky-900/40 text-sky-400" : "hover:bg-sky-50 text-sky-600"}`}><Home size={15} /></button>
                                  <button onClick={() => handleAttendanceEntry(emp.id, "00:00", "Leave")} title="Leave"
                                    className={`p-1.5 rounded-lg hover:scale-110 transition-all ${darkMode ? "hover:bg-amber-900/40 text-amber-400" : "hover:bg-amber-50 text-amber-600"}`}><UserX size={15} /></button>
                                  <button onClick={() => handleAttendanceEntry(emp.id, "00:00", "Absent")} title="Absent"
                                    className={`p-1.5 rounded-lg hover:scale-110 transition-all ${darkMode ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}><XCircle size={15} /></button>
                                  <button onClick={() => handleAttendanceEntry(emp.id, "00:00", "Late Start Request")} title="Late Start"
                                    className={`p-1.5 rounded-lg hover:scale-110 transition-all ${darkMode ? "hover:bg-orange-900/40 text-orange-400" : "hover:bg-orange-50 text-orange-600"}`}><Coffee size={15} /></button>
                                </div>
                              </td>
                              <td className="py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button title={dayRecord?.note || "Add note"}
                                    onClick={() => { setNoteModal({ empId: emp.id, field: "note" }); setNoteValue(dayRecord?.note || ""); }}
                                    className={`p-1.5 rounded-lg ${dayRecord?.note ? "text-blue-500" : darkMode ? "text-gray-600 hover:text-gray-400" : "text-gray-300 hover:text-gray-500"}`}>
                                    <StickyNote size={15} />
                                  </button>
                                  {(dayRecord?.status === "Late" || dayRecord?.status === "Late Start Request") && (
                                    <button title={dayRecord?.lateReason || "Add late reason"}
                                      onClick={() => { setNoteModal({ empId: emp.id, field: "lateReason" }); setNoteValue(dayRecord?.lateReason || ""); }}
                                      className={`p-1.5 rounded-lg ${dayRecord?.lateReason ? "text-orange-500" : darkMode ? "text-gray-600 hover:text-gray-400" : "text-gray-300 hover:text-gray-500"}`}>
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
                                <button onClick={() => removeEmployee(emp.id)}
                                  className={`p-1.5 rounded-lg ${darkMode ? "text-gray-700 hover:bg-rose-900/30 hover:text-rose-400" : "text-gray-200 hover:bg-rose-50 hover:text-rose-500"}`}>
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredAttendanceEmps.length === 0 && (
                          <tr><td colSpan={7} className={`text-center py-10 text-sm ${darkMode ? "text-gray-500" : "text-gray-400"}`}>No active employees match your search.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Side Panel */}
                <div className="space-y-4">
                  {/* Upcoming Alerts */}
                  {(upcomingBirthdays.length > 0 || upcomingHolidays.length > 0) && (
                    <div className={`rounded-2xl shadow-lg p-5 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Bell size={14} className="text-amber-500" /> Upcoming Alerts
                      </h3>
                      <div className="space-y-2">
                        {upcomingBirthdays.map(emp => (
                          <div key={emp.id} className={`flex items-center gap-2 p-2 rounded-lg ${darkMode ? "bg-pink-900/20" : "bg-pink-50"}`}>
                            <Cake size={14} className="text-pink-500 shrink-0" />
                            <div>
                              <div className={`text-xs font-medium ${darkMode ? "text-pink-300" : "text-pink-700"}`}>{emp.name}</div>
                              <div className={`text-xs ${darkMode ? "text-pink-400" : "text-pink-500"}`}>
                                {emp.daysUntil === 0 ? "🎂 Birthday today!" : `Birthday in ${emp.daysUntil} day${emp.daysUntil > 1 ? "s" : ""}`}
                              </div>
                            </div>
                          </div>
                        ))}
                        {upcomingHolidays.map(h => (
                          <div key={h.date} className={`flex items-center gap-2 p-2 rounded-lg ${darkMode ? "bg-purple-900/20" : "bg-purple-50"}`}>
                            <CalendarOff size={14} className="text-purple-500 shrink-0" />
                            <div>
                              <div className={`text-xs font-medium ${darkMode ? "text-purple-300" : "text-purple-700"}`}>{h.name}</div>
                              <div className={`text-xs ${darkMode ? "text-purple-400" : "text-purple-500"}`}>
                                {h.daysUntil === 0 ? "Today" : `In ${h.daysUntil} day${h.daysUntil > 1 ? "s" : ""}`} · {h.type === "company" ? "Company" : "Public"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Leave Balances */}
                  <div className={`rounded-2xl shadow-lg p-5 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <BarChart3 size={14} className="text-purple-500" /> Leave Balances
                    </h3>
                    <div className="space-y-4">
                      {activeEmployees.map(emp => {
                        const pct = (emp.remainingLeaves / emp.totalLeaves) * 100;
                        return (
                          <div key={emp.id}>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className={`font-medium truncate max-w-[130px] ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{emp.name}</span>
                              <span className={`font-bold ${emp.remainingLeaves <= 3 ? "text-rose-500" : darkMode ? "text-gray-300" : "text-gray-600"}`}>
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

                  {/* Holidays List */}
                  <div className={`rounded-2xl shadow-lg p-5 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <CalendarOff size={14} className="text-purple-500" /> Holidays
                    </h3>
                    {holidays.length === 0 && <p className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>No holidays added yet. Use Import CSV or Add Holiday.</p>}
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {holidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => (
                        <div key={h.date} className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>{h.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${h.type === "company" ? "bg-sky-100 text-sky-600" : "bg-purple-100 text-purple-600"}`}>
                                {h.type === "company" ? "Co." : "Pub."}
                              </span>
                            </div>
                            <div className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                              {h.date} {h.considerAttendance ? "· tracked" : ""}
                            </div>
                          </div>
                          <button onClick={() => removeHoliday(h.date)}
                            className={`${darkMode ? "text-gray-600 hover:text-rose-400" : "text-gray-300 hover:text-rose-500"} transition-colors`}>
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
        )}
      </div>

      {/* ── Employee Form Modal ──────────────────────────────────────────────── */}
      {showEmpForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <div className={`sticky top-0 flex items-center justify-between p-6 pb-4 border-b ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}>
              <h3 className="text-base font-bold">{editingEmp ? "Edit Employee" : "Add New Employee"}</h3>
              <button onClick={() => setShowEmpForm(false)} className={`p-1.5 rounded-lg ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}><X size={16} /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fi("Employee ID *", "employeeId")}
              {fi("Full Name *", "name")}
              {fi("Designation", "designation")}
              {fi("Department", "department")}
              {fi("Blood Group", "bloodGroup", "text", BLOOD_GROUPS)}
              {fi("Phone Number", "phone", "tel")}
              {fi("Email Address", "email", "email")}
              {fi("Emergency Contact", "emergencyContact", "tel")}
              <div className="sm:col-span-2">{fi("Present Address", "presentAddress")}</div>
              {fi("Birthday", "birthday", "date")}
              {fi("Joining Date", "joiningDate", "date")}
              {fi("Cessation Date", "cessationDate", "date")}
              <div>
                <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Total Leaves / Year</label>
                <input type="number" value={empForm.totalLeaves}
                  onChange={e => setEmpForm(f => ({ ...f, totalLeaves: Number(e.target.value), remainingLeaves: Number(e.target.value) }))}
                  className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
              </div>
            </div>
            <div className={`sticky bottom-0 flex gap-3 p-6 pt-4 border-t ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}>
              <button onClick={() => setShowEmpForm(false)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={saveEmployee}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2">
                <Save size={14} />{editingEmp ? "Save Changes" : "Add Employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Holiday Form Modal ───────────────────────────────────────────────── */}
      {showHolidayForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <div className="flex items-center justify-between p-6 pb-4">
              <h3 className="text-base font-bold">Add Holiday</h3>
              <button onClick={() => setShowHolidayForm(false)} className={`p-1.5 rounded-lg ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}><X size={16} /></button>
            </div>
            <div className="px-6 pb-4 space-y-3">
              <div>
                <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Date *</label>
                <input type="date" value={newHoliday.date} onChange={e => setNewHoliday(h => ({ ...h, date: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-purple-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
              </div>
              <div>
                <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Holiday Name *</label>
                <input value={newHoliday.name} onChange={e => setNewHoliday(h => ({ ...h, name: e.target.value }))}
                  placeholder="e.g. Eid ul-Fitr"
                  className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-purple-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
              </div>
              <div>
                <label className={`text-xs font-medium block mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Type</label>
                <select value={newHoliday.type} onChange={e => setNewHoliday(h => ({ ...h, type: e.target.value as HolidayType }))}
                  className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-purple-500 ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`}>
                  <option value="public">Public Holiday</option>
                  <option value="company">Company Holiday</option>
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={newHoliday.considerAttendance}
                  onChange={e => setNewHoliday(h => ({ ...h, considerAttendance: e.target.checked }))}
                  className="w-4 h-4 rounded" />
                <div>
                  <div className="text-sm font-medium">Track attendance on this day</div>
                  <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>If unchecked, marking attendance will show a warning. Won't deduct from leave balance.</div>
                </div>
              </label>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowHolidayForm(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={addHoliday}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white">Add Holiday</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Holiday Override Warning ─────────────────────────────────────────── */}
      {holidayWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm p-6 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <h3 className="text-base font-bold">Holiday Override</h3>
            </div>
            <p className={`text-sm mb-5 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
              <strong>{selectedDate}</strong> is marked as a holiday (<strong>{getHoliday(selectedDate)?.name}</strong>) with attendance tracking turned off.<br /><br />
              This will <strong>not</strong> deduct from the employee's leave balance. Do you want to proceed?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setHolidayWarning(null)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={confirmHolidayOverride}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white">Mark Anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Note / Late Reason Modal ─────────────────────────────────────────── */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm ${darkMode ? "bg-gray-800" : "bg-white"}`}>
            <div className="flex items-center justify-between p-6 pb-4">
              <div>
                <h3 className="text-base font-bold">{noteModal.field === "note" ? "📝 Add Note" : "⚠️ Late Reason"}</h3>
                <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                  {employees.find(e => e.id === noteModal.empId)?.name} · {selectedDate}
                </p>
              </div>
              <button onClick={() => setNoteModal(null)} className={`p-1.5 rounded-lg ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}><X size={16} /></button>
            </div>
            <div className="px-6 pb-4">
              <textarea value={noteValue} onChange={e => setNoteValue(e.target.value)} rows={3}
                placeholder={noteModal.field === "note" ? "e.g. Client visit, doctor's appointment…" : "e.g. Traffic, medical appointment…"}
                className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 resize-none ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "border-gray-200"}`} />
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setNoteModal(null)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={() => {
                setRecords(prev => prev.map(r =>
                  r.date === selectedDate && r.employeeId === noteModal.empId
                    ? { ...r, [noteModal.field]: noteValue } : r
                ));
                setNoteModal(null);
              }} className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
