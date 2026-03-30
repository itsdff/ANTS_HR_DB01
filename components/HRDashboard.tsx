"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Clock, UserX, Home, Coffee, BarChart3, Plus, Trash2, Download,
  CalendarDays, StickyNote, AlertTriangle, CalendarOff, Search,
  Sun, Moon, Users, CheckCircle2, XCircle, Laptop, TrendingUp,
  ChevronLeft, ChevronRight, Filter, Edit2, Save, X, Cake,
  Phone, Mail, MapPin, Droplets, Briefcase, Upload, Bell,
  GitBranch, LayoutGrid, Ban
} from "lucide-react";
import {
  format, isBefore, parse, getDaysInMonth, startOfMonth,
  getDay, isToday, parseISO, differenceInDays
} from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type AttendanceStatus =
  | "On Time" | "Late" | "Absent" | "WFH" | "Leave"
  | "Late Start Request" | "Holiday" | "Not Scheduled" | "Day Off";
type MainTab = "employees" | "attendance";
type EmpView = "tiles" | "organogram";
type AttendanceView = "daily" | "calendar" | "summary";
type HolidayType = "public" | "company";
type EmploymentType = "full-time" | "part-time";
type PositionType = "permanent" | "contractual";

const DAYS_OF_WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYS_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  reportsTo: string;
  bloodGroup: string;
  phoneCode: string;
  phone: string;
  emergencyCode: string;
  emergencyContact: string;
  email: string;
  companyEmail: string;
  presentAddress: string;
  birthday: string;
  joiningDate: string;
  cessationDate: string;
  employmentType: EmploymentType;
  positionType: PositionType;
  workingDays: number[];
  workingHours: string;
  totalLeaves: number;
  remainingLeaves: number;
  lateStartLimit: number; // per month
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

// ─── Migration ────────────────────────────────────────────────────────────────
function migrateEmployee(e: Partial<Employee>): Employee {
  return {
    id: e.id ?? Date.now().toString(),
    employeeId: e.employeeId ?? "",
    name: e.name ?? "",
    designation: e.designation ?? "",
    department: e.department ?? "",
    reportsTo: e.reportsTo ?? "",
    bloodGroup: e.bloodGroup ?? "",
    phoneCode: e.phoneCode ?? "+880",
    phone: e.phone ?? "",
    emergencyCode: e.emergencyCode ?? "+880",
    emergencyContact: e.emergencyContact ?? "",
    email: e.email ?? "",
    companyEmail: e.companyEmail ?? "",
    presentAddress: e.presentAddress ?? "",
    birthday: e.birthday ?? "",
    joiningDate: e.joiningDate ?? "",
    cessationDate: e.cessationDate ?? "",
    employmentType: e.employmentType ?? "full-time",
    positionType: e.positionType ?? "permanent",
    workingDays: e.workingDays ?? [1,2,3,4,5],
    workingHours: e.workingHours ?? "",
    totalLeaves: e.totalLeaves ?? 20,
    remainingLeaves: e.remainingLeaves ?? 20,
    lateStartLimit: e.lateStartLimit ?? 2,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EMPTY_EMP: Omit<Employee, "id"> = {
  employeeId: "", name: "", designation: "", department: "", reportsTo: "",
  bloodGroup: "", phoneCode: "+880", phone: "", emergencyCode: "+880",
  emergencyContact: "", email: "", companyEmail: "", presentAddress: "",
  birthday: "", joiningDate: "", cessationDate: "",
  employmentType: "full-time", positionType: "permanent",
  workingDays: [1,2,3,4,5], workingHours: "",
  totalLeaves: 20, remainingLeaves: 20, lateStartLimit: 2,
};

const DEFAULT_EMPLOYEES: Employee[] = [
  migrateEmployee({ id:"1", employeeId:"ANTS-001", name:"Alice Johnson", designation:"Lead Engineer", department:"Engineering", bloodGroup:"B+", phone:"01700000001", email:"alice@gmail.com", companyEmail:"alice@antsdronehub.com", presentAddress:"Dhaka", birthday:"1995-03-15", joiningDate:"2022-01-10" }),
  migrateEmployee({ id:"2", employeeId:"ANTS-002", name:"Bob Smith", designation:"Marketing Manager", department:"Marketing", bloodGroup:"O+", phone:"01700000003", email:"bob@gmail.com", companyEmail:"bob@antsdronehub.com", presentAddress:"Chittagong", birthday:"1990-07-22", joiningDate:"2021-06-01" }),
];

const STATUS_STYLES: Record<string, string> = {
  "On Time":            "bg-emerald-100 text-emerald-700",
  "Late":               "bg-rose-100 text-rose-700",
  "Absent":             "bg-gray-200 text-gray-600",
  "WFH":                "bg-sky-100 text-sky-700",
  "Leave":              "bg-amber-100 text-amber-700",
  "Late Start Request": "bg-orange-100 text-orange-700",
  "Holiday":            "bg-purple-100 text-purple-700",
  "Not Scheduled":      "bg-gray-100 text-gray-400",
  "Day Off":            "bg-slate-100 text-slate-500",
};
const STATUS_DOT: Record<string, string> = {
  "On Time":"bg-emerald-500","Late":"bg-rose-500","Absent":"bg-gray-400",
  "WFH":"bg-sky-500","Leave":"bg-amber-500","Late Start Request":"bg-orange-500",
  "Holiday":"bg-purple-500","Not Scheduled":"bg-gray-300","Day Off":"bg-slate-400",
};
const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) => { try { return format(parseISO(iso),"dd/MM/yyyy"); } catch { return iso; } };

function sortByEmpId(a: Employee, b: Employee) {
  return a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true });
}
function groupByDept(emps: Employee[]): Record<string, Employee[]> {
  const g: Record<string, Employee[]> = {};
  [...emps].sort(sortByEmpId).forEach(e => {
    const d = e.department || "Unassigned";
    if (!g[d]) g[d] = [];
    g[d].push(e);
  });
  return g;
}
function getUpcomingBirthdays(employees: Employee[], days = 7) {
  const today = new Date();
  return employees.filter(e => !e.cessationDate && e.birthday).map(e => {
    const b = parseISO(e.birthday);
    let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
    if (isBefore(next, today)) next = new Date(today.getFullYear()+1, b.getMonth(), b.getDate());
    return { ...e, daysUntil: differenceInDays(next, today) };
  }).filter(e => e.daysUntil >= 0 && e.daysUntil <= days);
}
function getUpcomingHolidays(holidays: Holiday[], days = 7) {
  const today = new Date();
  return holidays.filter(h => {
    const diff = differenceInDays(parseISO(h.date), today);
    return diff >= 0 && diff <= days;
  }).map(h => ({ ...h, daysUntil: differenceInDays(parseISO(h.date), today) }));
}

// ─── Dept colors ──────────────────────────────────────────────────────────────
const DEPT_COLORS = [
  "bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500",
  "bg-rose-500","bg-sky-500","bg-orange-500","bg-teal-500","bg-pink-500","bg-indigo-500",
];
function deptColor(dept: string, all: string[]): string {
  const idx = all.indexOf(dept);
  return DEPT_COLORS[idx % DEPT_COLORS.length] ?? "bg-gray-500";
}

// ─── CSV template ─────────────────────────────────────────────────────────────
const EMP_CSV_HEADERS = [
  "Employee ID","Full Name","Designation","Department","Blood Group",
  "Phone","Personal Email","Company Email","Present Address",
  "Birthday (YYYY-MM-DD)","Joining Date (YYYY-MM-DD)","Employment Type","Position Type","Total Leaves",
];
const HOLIDAY_CSV_HEADERS = ["Date (YYYY-MM-DD)","Holiday Name","Type (public/company)"];

// ═══════════════════════════════════════════════════════════════════════════════
export default function HRDashboard() {
  const [employees, setEmployees]         = useState<Employee[]>(DEFAULT_EMPLOYEES);
  const [records,   setRecords]           = useState<AttendanceRecord[]>([]);
  const [holidays,  setHolidays]          = useState<Holiday[]>([]);
  const [lateLimit, setLateLimit]         = useState("09:00");
  const [selectedDate, setSelectedDate]   = useState(format(new Date(),"yyyy-MM-dd"));
  const [isHydrated, setIsHydrated]       = useState(false);
  const [darkMode,  setDarkMode]          = useState(false);
  const [mainTab,   setMainTab]           = useState<MainTab>("attendance");
  const [empView,   setEmpView]           = useState<EmpView>("tiles");
  const [attendanceView, setAttendanceView] = useState<AttendanceView>("daily");
  const [searchQuery, setSearchQuery]     = useState("");
  const [deptFilter,  setDeptFilter]      = useState("All");
  const [calendarEmpId, setCalendarEmpId] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [showEmpForm,  setShowEmpForm]    = useState(false);
  const [editingEmp,   setEditingEmp]     = useState<Employee | null>(null);
  const [empForm,      setEmpForm]        = useState<Omit<Employee,"id">>(EMPTY_EMP);

  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [newHoliday, setNewHoliday]       = useState({ date:"", name:"", type:"public" as HolidayType, considerAttendance: false });

  const [holidayWarning, setHolidayWarning]   = useState(false);
  const [lateStartWarning, setLateStartWarning] = useState<{ empName: string; used: number; limit: number } | null>(null);
  const [pendingEntry, setPendingEntry]   = useState<{ empId: string; inTime: string; status?: AttendanceStatus } | null>(null);

  // Late Start Request — time entry modal
  const [lateStartModal, setLateStartModal]   = useState<{ empId: string } | null>(null);
  const [lateStartTime,  setLateStartTime]    = useState("");

  const [noteModal, setNoteModal]         = useState<{ empId: string; field: "note"|"lateReason" } | null>(null);
  const [noteValue, setNoteValue]         = useState("");

  const empCsvRef     = useRef<HTMLInputElement>(null);
  const holidayCsvRef = useRef<HTMLInputElement>(null);

  // ─── Hydration ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const raw = load<Partial<Employee>[]>("ants_employees",[]);
    setEmployees(raw.length > 0 ? raw.map(migrateEmployee) : DEFAULT_EMPLOYEES);
    setRecords(load<AttendanceRecord[]>("ants_records",[]));
    setHolidays(load<Holiday[]>("ants_holidays",[]));
    setDarkMode(load<boolean>("ants_dark",false));
    setIsHydrated(true);
  }, []);
  useEffect(() => { if (isHydrated) save("ants_records",   records);   }, [records,    isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_employees", employees); }, [employees,  isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_holidays",  holidays);  }, [holidays,   isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_dark",      darkMode);  }, [darkMode,   isHydrated]);
  useEffect(() => { if (employees.length > 0 && !calendarEmpId) setCalendarEmpId(employees[0].id); }, [employees, calendarEmpId]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const activeEmployees = useMemo(() => employees.filter(e => !e.cessationDate), [employees]);
  const allDepts        = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort(), [employees]);
  const departments     = useMemo(() => ["All", ...allDepts], [allDepts]);

  const filteredAttendanceEmps = useMemo(() => activeEmployees.filter(e => {
    const ms = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
    const md = deptFilter === "All" || e.department === deptFilter;
    return ms && md;
  }), [activeEmployees, searchQuery, deptFilter]);

  const attendanceGroups = useMemo(() => groupByDept(filteredAttendanceEmps), [filteredAttendanceEmps]);
  const getHoliday = (date: string) => holidays.find(h => h.date === date);

  // Today stats — always based on today's date
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayStats = useMemo(() => {
    const tr = records.filter(r => r.date === todayStr);
    return {
      total:   activeEmployees.length,
      present: tr.filter(r => r.status === "On Time" || r.status === "Late Start Request").length,
      late:    tr.filter(r => r.status === "Late").length,
      wfh:     tr.filter(r => r.status === "WFH").length,
      onLeave: tr.filter(r => r.status === "Leave").length,
      absent:  tr.filter(r => r.status === "Absent").length,
    };
  }, [records, activeEmployees, todayStr]);

  const upcomingBirthdays = useMemo(() => getUpcomingBirthdays(activeEmployees), [activeEmployees]);
  const upcomingHolidays  = useMemo(() => getUpcomingHolidays(holidays), [holidays]);

  // ─── Late start count for an employee in current month ───────────────────────
  const getLateStartCount = (empId: string, monthStr: string) => {
    // monthStr = "yyyy-MM"
    return records.filter(r =>
      r.employeeId === empId &&
      r.status === "Late Start Request" &&
      r.date.startsWith(monthStr)
    ).length;
  };

  // ─── Attendance ──────────────────────────────────────────────────────────────
  const commitEntry = (empId: string, inTime: string, status?: AttendanceStatus) => {
    let finalStatus: AttendanceStatus = "On Time";
    if (status) {
      finalStatus = status;
    } else {
      const limit = parse(lateLimit,"HH:mm", new Date());
      const entry = parse(inTime,"HH:mm", new Date());
      if (isNaN(entry.getTime())) return;
      finalStatus = isBefore(entry, limit) || inTime === lateLimit ? "On Time" : "Late";
    }
    const existing = records.find(r => r.date === selectedDate && r.employeeId === empId);
    const wasLeave  = existing?.status === "Leave";
    const isNowLeave = finalStatus === "Leave";
    setRecords(prev => [
      ...prev.filter(r => !(r.date === selectedDate && r.employeeId === empId)),
      { date: selectedDate, employeeId: empId, status: finalStatus, inTime,
        note: existing?.note ?? "", lateReason: existing?.lateReason ?? "" },
    ]);
    if (isNowLeave && !wasLeave)  setEmployees(prev => prev.map(e => e.id === empId ? { ...e, remainingLeaves: Math.max(0, e.remainingLeaves-1) } : e));
    if (!isNowLeave && wasLeave)  setEmployees(prev => prev.map(e => e.id === empId ? { ...e, remainingLeaves: Math.min(e.totalLeaves, e.remainingLeaves+1) } : e));
  };

  const handleAttendanceEntry = (empId: string, inTime: string, status?: AttendanceStatus) => {
    if (!status && !inTime) return;
    const holiday = getHoliday(selectedDate);
    if (holiday && !holiday.considerAttendance) {
      setPendingEntry({ empId, inTime, status });
      setHolidayWarning(true);
      return;
    }
    commitEntry(empId, inTime, status);
  };

  // Open Late Start time modal instead of defaulting to 00:00
  const openLateStartModal = (empId: string) => {
    setLateStartModal({ empId });
    setLateStartTime("");
  };

  const confirmLateStart = () => {
    if (!lateStartModal) return;
    const { empId } = lateStartModal;
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    const monthStr = selectedDate.slice(0,7);
    const used = getLateStartCount(empId, monthStr);
    // Check limit — warn but still allow
    if (used >= emp.lateStartLimit) {
      setLateStartWarning({ empName: emp.name, used, limit: emp.lateStartLimit });
      // Store pending and show warning; after dismissing warning we commit
      setPendingEntry({ empId, inTime: lateStartTime || "00:00", status: "Late Start Request" });
      setLateStartModal(null);
      return;
    }
    commitEntry(empId, lateStartTime || "00:00", "Late Start Request");
    setLateStartModal(null);
  };

  const confirmHolidayOverride = () => {
    if (pendingEntry) commitEntry(pendingEntry.empId, pendingEntry.inTime, pendingEntry.status);
    setHolidayWarning(false); setPendingEntry(null);
  };

  // Clear entry for part-time day off
  const clearEntry = (empId: string) => {
    const existing = records.find(r => r.date === selectedDate && r.employeeId === empId);
    if (existing?.status === "Leave") {
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, remainingLeaves: Math.min(e.totalLeaves, e.remainingLeaves+1) } : e));
    }
    setRecords(prev => prev.filter(r => !(r.date === selectedDate && r.employeeId === empId)));
  };

  const getSummary = (empId: string) => {
    const er = records.filter(r => r.employeeId === empId);
    return {
      onTime:  er.filter(r => r.status === "On Time").length,
      late:    er.filter(r => r.status === "Late").length,
      leave:   er.filter(r => r.status === "Leave").length,
      wfh:     er.filter(r => r.status === "WFH").length,
      absent:  er.filter(r => r.status === "Absent").length,
      lateStart: er.filter(r => r.status === "Late Start Request").length,
    };
  };

  // ─── Employee CRUD ───────────────────────────────────────────────────────────
  const openAddEmp  = () => { setEditingEmp(null); setEmpForm(EMPTY_EMP); setShowEmpForm(true); };
  const openEditEmp = (emp: Employee) => { setEditingEmp(emp); const { id, ...rest } = emp; void id; setEmpForm(rest); setShowEmpForm(true); };
  const saveEmployee = () => {
    if (!empForm.name.trim()) return;
    if (editingEmp) setEmployees(prev => prev.map(e => e.id === editingEmp.id ? { ...empForm, id: editingEmp.id } : e));
    else            setEmployees(prev => [...prev, { ...empForm, id: Date.now().toString() }]);
    setShowEmpForm(false);
  };
  const removeEmployee = (id: string) => {
    if (!confirm("Remove this employee? Records remain.")) return;
    setEmployees(prev => prev.filter(e => e.id !== id));
  };

  // ─── Holidays ───────────────────────────────────────────────────────────────
  const addHoliday = () => {
    if (!newHoliday.date || !newHoliday.name.trim()) return;
    setHolidays(prev => [...prev.filter(h => h.date !== newHoliday.date), { ...newHoliday }]);
    setNewHoliday({ date:"", name:"", type:"public", considerAttendance: false });
    setShowHolidayForm(false);
  };
  const removeHoliday = (date: string) => setHolidays(prev => prev.filter(h => h.date !== date));

  // ─── CSV imports ─────────────────────────────────────────────────────────────
  const handleEmpCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = (ev.target?.result as string).split("\n").filter(Boolean);
      const data  = lines.slice(1); // skip header
      let count = 0;
      const imported: Employee[] = data.map(line => {
        const p = line.split(",").map(s => s.replace(/"/g,"").trim());
        count++;
        return migrateEmployee({
          id: Date.now().toString() + count,
          employeeId: p[0], name: p[1], designation: p[2], department: p[3],
          bloodGroup: p[4], phone: p[5], email: p[6], companyEmail: p[7],
          presentAddress: p[8], birthday: p[9], joiningDate: p[10],
          employmentType: (p[11] === "part-time" ? "part-time" : "full-time"),
          positionType: (p[12] === "contractual" ? "contractual" : "permanent"),
          totalLeaves: parseInt(p[13]) || 20,
          remainingLeaves: parseInt(p[13]) || 20,
        });
      }).filter(e => e.name);
      if (imported.length) {
        setEmployees(prev => {
          const map = new Map(prev.map(e => [e.employeeId, e]));
          imported.forEach(e => map.set(e.employeeId, e));
          return Array.from(map.values());
        });
        alert(`✅ Imported ${imported.length} employees.`);
      } else alert("❌ No valid rows found.");
    };
    reader.readAsText(file); e.target.value = "";
  };

  const handleHolidayCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed: Holiday[] = [];
      (ev.target?.result as string).split("\n").forEach(line => {
        const p = line.split(",").map(s => s.replace(/"/g,"").trim());
        if (p[0]?.match(/^\d{4}-\d{2}-\d{2}$/))
          parsed.push({ date: p[0], name: p[1]||"Holiday", type: p[2]==="company"?"company":"public", considerAttendance: false });
      });
      if (parsed.length) {
        setHolidays(prev => { const m = new Map(prev.map(h => [h.date,h])); parsed.forEach(h => m.set(h.date,h)); return Array.from(m.values()); });
        alert(`✅ Imported ${parsed.length} holidays.`);
      } else alert("❌ No valid rows. Format: YYYY-MM-DD, Name");
    };
    reader.readAsText(file); e.target.value = "";
  };

  // ─── CSV exports ─────────────────────────────────────────────────────────────
  const downloadCSV = (rows: string[][], filename: string) => {
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv],{ type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportAttendanceCSV = () => {
    const rows = [["Date","Employee ID","Name","Designation","Department","Employment","Position","Status","In Time","Note","Late Reason"]];
    records.forEach(r => {
      const emp = employees.find(e => e.id === r.employeeId);
      rows.push([fmtDate(r.date), emp?.employeeId||"", emp?.name||"", emp?.designation||"",
        emp?.department||"", emp?.employmentType||"", emp?.positionType||"",
        r.status, r.inTime, r.note, r.lateReason]);
    });
    downloadCSV(rows,"ants_attendance.csv");
  };

  const exportEmployeesCSV = () => {
    const rows = [EMP_CSV_HEADERS];
    employees.forEach(e => rows.push([
      e.employeeId, e.name, e.designation, e.department, e.bloodGroup,
      `${e.phoneCode} ${e.phone}`, e.email, e.companyEmail, e.presentAddress,
      e.birthday, e.joiningDate, e.employmentType, e.positionType, String(e.totalLeaves),
    ]));
    downloadCSV(rows,"ants_employees.csv");
  };

  const downloadEmpTemplate = () => downloadCSV([EMP_CSV_HEADERS, ["ANTS-003","Jane Doe","Engineer","Engineering","A+","01700000099","jane@gmail.com","jane@antsdronehub.com","Dhaka","1998-05-10","2024-01-15","full-time","permanent","20"]],"ants_employees_template.csv");
  const downloadHolidayTemplate = () => downloadCSV([HOLIDAY_CSV_HEADERS, ["2026-02-21","International Mother Language Day","public"]],"ants_holidays_template.csv");

  // ─── Employee form helpers ───────────────────────────────────────────────────
  const dc = darkMode;
  const inputCls = `w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${dc?"bg-gray-700 border-gray-600 text-white":"border-gray-200"}`;
  const labelCls = `text-xs font-medium block mb-1 ${dc?"text-gray-400":"text-gray-500"}`;

  const fi = (label: string, key: keyof Omit<Employee,"id">, type="text", opts?: string[]) => (
    <div>
      <label className={labelCls}>{label}</label>
      {opts
        ? <select value={empForm[key] as string} onChange={e=>setEmpForm(f=>({...f,[key]:e.target.value}))} className={inputCls}>
            <option value="">Select…</option>
            {opts.map(o=><option key={o}>{o}</option>)}
          </select>
        : <input type={type} value={empForm[key] as string} onChange={e=>setEmpForm(f=>({...f,[key]:e.target.value}))} className={inputCls}/>}
    </div>
  );

  const phoneField = (label: string, codeKey: keyof Omit<Employee,"id">, numKey: keyof Omit<Employee,"id">) => (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2">
        <select value={empForm[codeKey] as string} onChange={e=>setEmpForm(f=>({...f,[codeKey]:e.target.value}))}
          className={`rounded-lg px-2 py-2 text-sm border outline-none w-24 ${dc?"bg-gray-700 border-gray-600 text-white":"border-gray-200"}`}>
          <option value="+880">🇧🇩 +880</option>
        </select>
        <input type="tel" value={empForm[numKey] as string} onChange={e=>setEmpForm(f=>({...f,[numKey]:e.target.value}))}
          placeholder="01XXXXXXXXX" className={`flex-1 rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${dc?"bg-gray-700 border-gray-600 text-white":"border-gray-200"}`}/>
      </div>
    </div>
  );

  // ─── Calendar ────────────────────────────────────────────────────────────────
  const CalendarView = () => {
    const year=calendarMonth.getFullYear(), month=calendarMonth.getMonth();
    const days=getDaysInMonth(calendarMonth), first=getDay(startOfMonth(calendarMonth));
    const getCellStatus = (day:number):AttendanceStatus|null => {
      const ds=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      if (getHoliday(ds)) return "Holiday";
      return records.find(r=>r.date===ds&&r.employeeId===calendarEmpId)?.status||null;
    };
    return (
      <div className={`rounded-2xl shadow-lg p-6 ${dc?"bg-gray-800":"bg-white"}`}>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <select value={calendarEmpId} onChange={e=>setCalendarEmpId(e.target.value)}
            className={`rounded-lg px-3 py-2 text-sm border ${dc?"bg-gray-700 border-gray-600 text-white":"bg-gray-50 border-gray-200"}`}>
            {activeEmployees.sort(sortByEmpId).map(e=><option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>)}
          </select>
          <div className="flex items-center gap-2">
            <button onClick={()=>setCalendarMonth(m=>new Date(m.getFullYear(),m.getMonth()-1))} className={`p-2 rounded-lg ${dc?"hover:bg-gray-700 text-gray-300":"hover:bg-gray-100"}`}><ChevronLeft size={18}/></button>
            <span className={`font-semibold w-40 text-center ${dc?"text-white":""}`}>{format(calendarMonth,"MMMM yyyy")}</span>
            <button onClick={()=>setCalendarMonth(m=>new Date(m.getFullYear(),m.getMonth()+1))} className={`p-2 rounded-lg ${dc?"hover:bg-gray-700 text-gray-300":"hover:bg-gray-100"}`}><ChevronRight size={18}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS_SHORT.map(d=><div key={d} className="text-center text-xs font-semibold py-1 text-gray-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({length:first}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:days}).map((_,i)=>{
            const day=i+1;
            const ds=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const status=getCellStatus(day);
            const cur=isToday(parseISO(ds));
            return (
              <div key={day} onClick={()=>{setSelectedDate(ds);setAttendanceView("daily");}}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 text-xs font-bold
                  ${cur?"ring-2 ring-blue-500":""}
                  ${status?STATUS_STYLES[status]:dc?"bg-gray-700 text-gray-400 hover:bg-gray-600":"bg-gray-50 text-gray-400 hover:bg-gray-100"}`}>
                {day}
                {status&&<div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${STATUS_DOT[status]}`}/>}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          {Object.entries(STATUS_DOT).map(([s,dot])=>(
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${dot}`}/>
              <span className={`text-xs ${dc?"text-gray-400":"text-gray-500"}`}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Organogram ──────────────────────────────────────────────────────────────
  const OrgNode = ({ emp, depth }:{ emp:Employee; depth:number }) => {
    const reports = employees.filter(e=>e.reportsTo===emp.id).sort(sortByEmpId);
    return (
      <div className="flex flex-col items-center">
        <div className={`rounded-xl border p-3 w-40 text-center shadow-sm
          ${depth===0?dc?"bg-blue-900/40 border-blue-600":"bg-blue-50 border-blue-300":
            depth===1?dc?"bg-gray-700 border-gray-600":"bg-white border-gray-200":
            dc?"bg-gray-750 border-gray-700":"bg-gray-50 border-gray-200"}`}>
          <div className={`w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center text-xs font-bold text-white
            ${depth===0?"bg-blue-600":depth===1?"bg-slate-500":"bg-gray-400"}`}>
            {emp.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
          </div>
          <div className={`text-xs font-semibold leading-tight ${dc?"text-white":"text-gray-800"}`}>{emp.name}</div>
          <div className={`text-xs mt-0.5 ${dc?"text-gray-400":"text-gray-500"}`}>{emp.designation||emp.department}</div>
          <div className={`text-xs mt-0.5 ${dc?"text-gray-500":"text-gray-400"}`}>{emp.employeeId}</div>
        </div>
        {reports.length>0&&(
          <div className="flex flex-col items-center">
            <div className={`w-px h-6 ${dc?"bg-gray-600":"bg-gray-300"}`}/>
            <div className="flex gap-4 items-start">
              {reports.map(r=>(
                <div key={r.id} className="flex flex-col items-center">
                  <div className={`w-px h-5 ${dc?"bg-gray-600":"bg-gray-300"}`}/>
                  <OrgNode emp={r} depth={depth+1}/>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const OrganogramView = () => {
    const roots = employees.filter(e=>!e.reportsTo||!employees.find(x=>x.id===e.reportsTo)).sort(sortByEmpId);
    return (
      <div className={`rounded-2xl shadow-lg p-6 overflow-auto ${dc?"bg-gray-800":"bg-white"}`}>
        <h3 className="text-base font-semibold mb-6 flex items-center gap-2"><GitBranch size={16} className="text-blue-500"/> Organisation Chart</h3>
        <div className="flex gap-8 items-start justify-center flex-wrap min-w-max mx-auto pb-4">
          {roots.map(e=><OrgNode key={e.id} emp={e} depth={0}/>)}
        </div>
        <p className={`text-xs mt-4 text-center ${dc?"text-gray-500":"text-gray-400"}`}>Set "Reports To" in each employee profile to build the hierarchy.</p>
      </div>
    );
  };

  if (!isHydrated) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Loading ANTS Drone Hub…</p>
    </div>
  );

  const holidayToday = getHoliday(selectedDate);

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen transition-colors duration-300 ${dc?"bg-gray-900 text-white":"bg-slate-50 text-gray-900"}`}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-sm ${dc?"bg-gray-900/90 border-gray-700":"bg-white/90 border-gray-200"}`}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow">
              <Users size={18} className="text-white"/>
            </div>
            <div>
              <h1 className="text-base font-bold leading-none tracking-tight">ANTS Drone Hub</h1>
              <p className={`text-xs ${dc?"text-gray-400":"text-gray-500"}`}>HR Dashboard · Attendance & Leave Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex rounded-lg p-1 gap-1 ${dc?"bg-gray-800":"bg-gray-100"}`}>
              {([["employees","Employees",Users],["attendance","Attendance",Clock]] as const).map(([tab,label,Icon])=>(
                <button key={tab} onClick={()=>setMainTab(tab)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all
                    ${mainTab===tab?"bg-blue-600 text-white shadow-sm":dc?"text-gray-400 hover:text-white":"text-gray-500 hover:text-gray-800"}`}>
                  <Icon size={13}/>{label}
                </button>
              ))}
            </div>
            <button onClick={()=>setDarkMode(d=>!d)} className={`p-2 rounded-lg ${dc?"bg-gray-800 hover:bg-gray-700 text-yellow-400":"bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
              {dc?<Sun size={16}/>:<Moon size={16}/>}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Stats — always shows today ───────────────────────────────────── */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {label:"Total",   value:todayStats.total,   icon:Users,        color:"text-blue-600",    bg:dc?"bg-blue-900/20":"bg-blue-50"},
            {label:"Present", value:todayStats.present, icon:CheckCircle2, color:"text-emerald-600", bg:dc?"bg-emerald-900/20":"bg-emerald-50"},
            {label:"Late",    value:todayStats.late,    icon:Clock,        color:"text-rose-600",    bg:dc?"bg-rose-900/20":"bg-rose-50"},
            {label:"WFH",     value:todayStats.wfh,     icon:Laptop,       color:"text-sky-600",     bg:dc?"bg-sky-900/20":"bg-sky-50"},
            {label:"On Leave",value:todayStats.onLeave, icon:XCircle,      color:"text-amber-600",   bg:dc?"bg-amber-900/20":"bg-amber-50"},
            {label:"Absent",  value:todayStats.absent,  icon:AlertTriangle,color:"text-gray-500",    bg:dc?"bg-gray-800":"bg-gray-100"},
          ].map(({label,value,icon:Icon,color,bg})=>(
            <div key={label} className={`rounded-xl p-4 ${bg} flex items-center gap-3`}>
              <Icon size={20} className={color}/>
              <div>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className={`text-xs ${dc?"text-gray-400":"text-gray-500"}`}>{label}</div>
              </div>
            </div>
          ))}
        </div>
        <p className={`text-xs -mt-4 ${dc?"text-gray-500":"text-gray-400"}`}>
          Today's summary — {fmtDate(todayStr)}
        </p>

        {/* ══════════ EMPLOYEES TAB ══════════════════════════════════════════ */}
        {mainTab==="employees"&&(
          <div>
            {/* Header row */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Users size={18} className="text-blue-500"/> Employee Profiles
                  <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${dc?"bg-gray-700 text-gray-300":"bg-gray-100 text-gray-500"}`}>
                    {employees.length} total · {activeEmployees.length} active
                  </span>
                </h2>
                <div className={`flex rounded-lg p-1 gap-1 ${dc?"bg-gray-800":"bg-gray-100"}`}>
                  {([["tiles","Tiles",LayoutGrid],["organogram","Org Chart",GitBranch]] as const).map(([v,label,Icon])=>(
                    <button key={v} onClick={()=>setEmpView(v)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all
                        ${empView===v?"bg-blue-600 text-white":dc?"text-gray-400 hover:text-white":"text-gray-500 hover:text-gray-700"}`}>
                      <Icon size={13}/>{label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Employee CSV actions */}
                <input ref={empCsvRef} type="file" accept=".csv" className="hidden" onChange={handleEmpCSV}/>
                <button onClick={downloadEmpTemplate}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${dc?"bg-gray-800 hover:bg-gray-700 text-gray-300":"bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
                  <Download size={13}/> Template
                </button>
                <button onClick={()=>empCsvRef.current?.click()}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${dc?"bg-gray-800 hover:bg-gray-700 text-gray-300":"bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
                  <Upload size={13}/> Import CSV
                </button>
                <button onClick={exportEmployeesCSV}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${dc?"bg-gray-800 hover:bg-gray-700 text-gray-300":"bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
                  <Download size={13}/> Export CSV
                </button>
                <button onClick={openAddEmp}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all">
                  <Plus size={14}/> Add Employee
                </button>
              </div>
            </div>

            {empView==="organogram"?<OrganogramView/>:(
              <div className="space-y-8">
                {Object.entries(groupByDept(employees)).sort(([a],[b])=>a.localeCompare(b)).map(([dept,emps])=>(
                  <div key={dept}>
                    <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${dc?"border-gray-700":"border-gray-200"}`}>
                      <div className={`w-3 h-3 rounded-full ${deptColor(dept,allDepts)}`}/>
                      <h3 className="text-sm font-bold">{dept}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${dc?"bg-gray-700 text-gray-400":"bg-gray-100 text-gray-500"}`}>{emps.length}</span>
                    </div>
                    {/* ── TILE GRID ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {emps.map(emp=>{
                        const isInactive=!!emp.cessationDate;
                        const color=deptColor(dept,allDepts);
                        return (
                          <div key={emp.id}
                            className={`rounded-xl border p-4 flex flex-col items-center text-center gap-2 transition-all hover:shadow-md cursor-default
                              ${isInactive?dc?"bg-gray-800/40 border-gray-700 opacity-50":"bg-gray-50 border-gray-200 opacity-60":dc?"bg-gray-800 border-gray-700 hover:border-gray-500":"bg-white border-gray-100 hover:border-gray-300"}`}>
                            {/* Avatar */}
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${isInactive?"bg-gray-400":color}`}>
                              {emp.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                            </div>
                            <div className="min-w-0 w-full">
                              <div className={`text-xs font-semibold leading-tight truncate ${dc?"text-white":"text-gray-800"}`}>{emp.name}</div>
                              <div className={`text-xs truncate mt-0.5 ${dc?"text-gray-400":"text-gray-500"}`}>{emp.designation||"—"}</div>
                              <div className={`text-xs mt-1 ${dc?"text-gray-500":"text-gray-400"}`}>{emp.employeeId}</div>
                              {isInactive&&<span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">Inactive</span>}
                            </div>
                            {/* Actions */}
                            <div className="flex gap-1 mt-1">
                              <button onClick={()=>openEditEmp(emp)} className={`p-1 rounded-lg ${dc?"hover:bg-gray-700 text-gray-400":"hover:bg-gray-100 text-gray-500"}`}><Edit2 size={12}/></button>
                              <button onClick={()=>removeEmployee(emp.id)} className={`p-1 rounded-lg ${dc?"hover:bg-rose-900/30 text-gray-600 hover:text-rose-400":"hover:bg-rose-50 text-gray-300 hover:text-rose-500"}`}><Trash2 size={12}/></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════ ATTENDANCE TAB ═════════════════════════════════════════ */}
        {mainTab==="attendance"&&(
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className={`flex rounded-lg p-1 gap-1 ${dc?"bg-gray-800":"bg-gray-100"}`}>
                {([["daily","Daily",Clock],["calendar","Calendar",CalendarDays],["summary","Summary",BarChart3]] as const).map(([mode,label,Icon])=>(
                  <button key={mode} onClick={()=>setAttendanceView(mode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                      ${attendanceView===mode?"bg-blue-600 text-white":dc?"text-gray-400 hover:text-white":"text-gray-500 hover:text-gray-800"}`}>
                    <Icon size={13}/>{label}
                  </button>
                ))}
              </div>
              <button onClick={exportAttendanceCSV}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${dc?"bg-gray-800 hover:bg-gray-700 text-gray-300":"bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
                <Download size={13}/> Export CSV
              </button>
            </div>

            {attendanceView==="calendar"&&<CalendarView/>}

            {/* Summary */}
            {attendanceView==="summary"&&(
              <div className={`rounded-2xl shadow-lg p-6 ${dc?"bg-gray-800":"bg-white"}`}>
                <h2 className="text-lg font-semibold mb-5 flex items-center gap-2"><TrendingUp size={18} className="text-purple-500"/> All-Time Summary</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`border-b text-xs uppercase ${dc?"border-gray-700 text-gray-400":"border-gray-100 text-gray-400"}`}>
                        <th className="py-3 text-left">Employee</th>
                        <th className="py-3 text-left">Designation</th>
                        <th className="py-3 text-left">Type</th>
                        <th className="py-3 text-center">On Time</th>
                        <th className="py-3 text-center">Late</th>
                        <th className="py-3 text-center">Late Start</th>
                        <th className="py-3 text-center">WFH</th>
                        <th className="py-3 text-center">Leave</th>
                        <th className="py-3 text-center">Absent</th>
                        <th className="py-3 text-center">Leaves Left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(groupByDept(employees)).sort(([a],[b])=>a.localeCompare(b)).flatMap(([dept,emps])=>[
                        <tr key={`dept-${dept}`}><td colSpan={10} className={`py-2 text-xs font-bold uppercase tracking-wider ${dc?"text-gray-500":"text-gray-400"}`}>{dept}</td></tr>,
                        ...emps.map(emp=>{
                          const s=getSummary(emp.id);
                          const monthStr=format(new Date(),"yyyy-MM");
                          const lsUsed=getLateStartCount(emp.id,monthStr);
                          return (
                            <tr key={emp.id} className={`border-b last:border-0 ${dc?"border-gray-700":"border-gray-50"}`}>
                              <td className="py-3 font-medium">
                                <div>{emp.name}</div>
                                <div className={`text-xs ${dc?"text-gray-500":"text-gray-400"}`}>{emp.employeeId}</div>
                              </td>
                              <td className={`py-3 text-xs ${dc?"text-gray-400":"text-gray-500"}`}>{emp.designation}</td>
                              <td className="py-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${emp.employmentType==="part-time"?"bg-amber-100 text-amber-700":"bg-emerald-100 text-emerald-700"}`}>
                                  {emp.employmentType==="part-time"?"PT":"FT"}
                                </span>
                              </td>
                              <td className="py-3 text-center text-emerald-600 font-semibold">{s.onTime}</td>
                              <td className="py-3 text-center text-rose-600 font-semibold">{s.late}</td>
                              <td className="py-3 text-center">
                                <span className={`font-semibold ${lsUsed>=emp.lateStartLimit?"text-rose-600":"text-orange-500"}`}>
                                  {s.lateStart}
                                </span>
                                <span className={`text-xs ml-1 ${dc?"text-gray-500":"text-gray-400"}`}>({lsUsed}/{emp.lateStartLimit} this mo.)</span>
                              </td>
                              <td className="py-3 text-center text-sky-600 font-semibold">{s.wfh}</td>
                              <td className="py-3 text-center text-amber-600 font-semibold">{s.leave}</td>
                              <td className="py-3 text-center text-gray-500 font-semibold">{s.absent}</td>
                              <td className="py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${emp.remainingLeaves<=3?"bg-rose-100 text-rose-700":dc?"bg-gray-700 text-gray-200":"bg-gray-100 text-gray-700"}`}>
                                  {emp.remainingLeaves}/{emp.totalLeaves}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ])}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Daily Entry */}
            {attendanceView==="daily"&&(
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                <div className={`xl:col-span-3 rounded-2xl shadow-lg p-6 ${dc?"bg-gray-800":"bg-white"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-base font-semibold flex items-center gap-2"><Clock size={16} className="text-blue-500"/> Daily Entry</h2>
                      <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
                        className={`rounded-lg px-2 py-1 text-sm border ${dc?"bg-gray-700 border-gray-600 text-white":"bg-gray-50 border-gray-200"}`}/>
                      <span className={`text-xs ${dc?"text-gray-400":"text-gray-500"}`}>{fmtDate(selectedDate)}</span>
                      {holidayToday&&(
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${holidayToday.type==="company"?"bg-sky-100 text-sky-700":"bg-purple-100 text-purple-700"}`}>
                          🎉 {holidayToday.name}{holidayToday.considerAttendance?" (tracked)":""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`text-xs font-medium ${dc?"text-gray-400":"text-gray-500"}`}>Late after</label>
                      <input type="time" value={lateLimit} onChange={e=>setLateLimit(e.target.value)}
                        className={`rounded-lg px-2 py-1 text-sm border ${dc?"bg-gray-700 border-gray-600 text-white":"bg-gray-50 border-gray-200"}`}/>
                    </div>
                  </div>

                  {/* Search & Filter */}
                  <div className="flex gap-3 mb-4">
                    <div className={`flex items-center gap-2 flex-1 rounded-lg px-3 py-2 border ${dc?"bg-gray-700 border-gray-600":"bg-gray-50 border-gray-200"}`}>
                      <Search size={14} className="text-gray-400"/>
                      <input placeholder="Search name or ID…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="bg-transparent outline-none w-full text-sm"/>
                    </div>
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${dc?"bg-gray-700 border-gray-600 text-white":"bg-gray-50 border-gray-200"}`}>
                      <Filter size={14} className="text-gray-400"/>
                      <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} className="bg-transparent outline-none text-sm">
                        {departments.map(d=><option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`border-b text-xs uppercase tracking-wide ${dc?"border-gray-700 text-gray-400":"border-gray-100 text-gray-400"}`}>
                          <th className="py-3 text-left">Employee</th>
                          <th className="py-3 text-left">Designation / Dept</th>
                          <th className="py-3 text-center">In-Time</th>
                          <th className="py-3 text-center">Quick Mark</th>
                          <th className="py-3 text-center">Remarks</th>
                          <th className="py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(attendanceGroups).sort(([a],[b])=>a.localeCompare(b)).flatMap(([dept,emps])=>[
                          <tr key={`dept-${dept}`}>
                            <td colSpan={6}>
                              <div className={`flex items-center gap-2 py-2 mt-2 text-xs font-bold uppercase tracking-wider ${dc?"text-gray-500":"text-gray-400"}`}>
                                <div className={`w-2 h-2 rounded-full ${deptColor(dept,allDepts)}`}/>{dept}
                              </div>
                            </td>
                          </tr>,
                          ...emps.map(emp=>{
                            const dayRecord=records.find(r=>r.date===selectedDate&&r.employeeId===emp.id);
                            const isPartTime=emp.employmentType==="part-time";
                            const monthStr=selectedDate.slice(0,7);
                            const lsUsed=getLateStartCount(emp.id,monthStr);
                            const lsAtLimit=lsUsed>=emp.lateStartLimit;
                            return (
                              <tr key={emp.id} className={`border-b last:border-0 ${dc?"border-gray-700":"border-gray-50"}`}>
                                <td className="py-3">
                                  <div className="font-medium text-sm">{emp.name}</div>
                                  <div className={`text-xs flex items-center gap-1 ${dc?"text-gray-500":"text-gray-400"}`}>
                                    {emp.employeeId}
                                    {isPartTime&&<span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 text-xs">PT</span>}
                                  </div>
                                </td>
                                <td className="py-3">
                                  <div className={`text-xs font-medium ${dc?"text-gray-300":"text-gray-700"}`}>{emp.designation||"—"}</div>
                                  <div className={`text-xs ${dc?"text-gray-500":"text-gray-400"}`}>{emp.department||"—"}</div>
                                </td>
                                <td className="py-3 text-center">
                                  <input type="time" value={dayRecord?.inTime||""}
                                    onChange={e=>{if(e.target.value) handleAttendanceEntry(emp.id,e.target.value);}}
                                    className={`rounded-lg px-2 py-1 text-xs border w-28 ${dc?"bg-gray-700 border-gray-600 text-white":"bg-gray-50 border-gray-200"}`}/>
                                </td>
                                <td className="py-3">
                                  <div className="flex items-center justify-center gap-1 flex-wrap">
                                    <button onClick={()=>handleAttendanceEntry(emp.id,"00:00","WFH")} title="WFH"
                                      className={`p-1.5 rounded-lg hover:scale-110 transition-all ${dc?"hover:bg-sky-900/40 text-sky-400":"hover:bg-sky-50 text-sky-600"}`}><Home size={15}/></button>
                                    <button onClick={()=>handleAttendanceEntry(emp.id,"00:00","Leave")} title="Leave"
                                      className={`p-1.5 rounded-lg hover:scale-110 transition-all ${dc?"hover:bg-amber-900/40 text-amber-400":"hover:bg-amber-50 text-amber-600"}`}><UserX size={15}/></button>
                                    <button onClick={()=>handleAttendanceEntry(emp.id,"00:00","Absent")} title="Absent"
                                      className={`p-1.5 rounded-lg hover:scale-110 transition-all ${dc?"hover:bg-gray-700 text-gray-400":"hover:bg-gray-100 text-gray-500"}`}><XCircle size={15}/></button>
                                    {/* Late Start — opens time modal */}
                                    <button onClick={()=>openLateStartModal(emp.id)} title={lsAtLimit?`⚠ Limit reached (${lsUsed}/${emp.lateStartLimit})`:` Late Start`}
                                      className={`p-1.5 rounded-lg hover:scale-110 transition-all relative ${lsAtLimit?dc?"text-rose-400 hover:bg-rose-900/30":"text-rose-500 hover:bg-rose-50":dc?"hover:bg-orange-900/40 text-orange-400":"hover:bg-orange-50 text-orange-600"}`}>
                                      <Coffee size={15}/>
                                      {lsAtLimit&&<span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500"/>}
                                    </button>
                                    {/* Part-time: clear entry */}
                                    {isPartTime&&(
                                      <button onClick={()=>clearEntry(emp.id)} title="Clear entry (Day Off)"
                                        className={`p-1.5 rounded-lg hover:scale-110 transition-all ${dc?"hover:bg-slate-700 text-slate-400":"hover:bg-slate-100 text-slate-500"}`}><Ban size={15}/></button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button title={dayRecord?.note||"Add note"}
                                      onClick={()=>{setNoteModal({empId:emp.id,field:"note"});setNoteValue(dayRecord?.note||"");}}
                                      className={`p-1.5 rounded-lg ${dayRecord?.note?"text-blue-500":dc?"text-gray-600 hover:text-gray-400":"text-gray-300 hover:text-gray-500"}`}>
                                      <StickyNote size={15}/>
                                    </button>
                                    {(dayRecord?.status==="Late"||dayRecord?.status==="Late Start Request")&&(
                                      <button title={dayRecord?.lateReason||"Add late reason"}
                                        onClick={()=>{setNoteModal({empId:emp.id,field:"lateReason"});setNoteValue(dayRecord?.lateReason||"");}}
                                        className={`p-1.5 rounded-lg ${dayRecord?.lateReason?"text-orange-500":dc?"text-gray-600 hover:text-gray-400":"text-gray-300 hover:text-gray-500"}`}>
                                        <AlertTriangle size={15}/>
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${dayRecord?STATUS_STYLES[dayRecord.status]:dc?"bg-gray-700 text-gray-500":"bg-gray-100 text-gray-400"}`}>
                                    {dayRecord?.status||"No Entry"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ])}
                        {filteredAttendanceEmps.length===0&&(
                          <tr><td colSpan={6} className={`text-center py-10 text-sm ${dc?"text-gray-500":"text-gray-400"}`}>No active employees match your search.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Side Panel */}
                <div className="space-y-4">
                  {/* Alerts */}
                  {(upcomingBirthdays.length>0||upcomingHolidays.length>0)&&(
                    <div className={`rounded-2xl shadow-lg p-5 ${dc?"bg-gray-800":"bg-white"}`}>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Bell size={14} className="text-amber-500"/> Upcoming Alerts</h3>
                      <div className="space-y-2">
                        {upcomingBirthdays.map(emp=>(
                          <div key={emp.id} className={`flex items-center gap-2 p-2 rounded-lg ${dc?"bg-pink-900/20":"bg-pink-50"}`}>
                            <Cake size={14} className="text-pink-500 shrink-0"/>
                            <div>
                              <div className={`text-xs font-medium ${dc?"text-pink-300":"text-pink-700"}`}>{emp.name}</div>
                              <div className={`text-xs ${dc?"text-pink-400":"text-pink-500"}`}>{emp.daysUntil===0?"🎂 Today!":`Birthday in ${emp.daysUntil}d`}</div>
                            </div>
                          </div>
                        ))}
                        {upcomingHolidays.map(h=>(
                          <div key={h.date} className={`flex items-center gap-2 p-2 rounded-lg ${dc?"bg-purple-900/20":"bg-purple-50"}`}>
                            <CalendarOff size={14} className="text-purple-500 shrink-0"/>
                            <div>
                              <div className={`text-xs font-medium ${dc?"text-purple-300":"text-purple-700"}`}>{h.name}</div>
                              <div className={`text-xs ${dc?"text-purple-400":"text-purple-500"}`}>{h.daysUntil===0?"Today":`In ${h.daysUntil}d`} · {h.type==="company"?"Company":"Public"}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Leave Balances */}
                  <div className={`rounded-2xl shadow-lg p-5 ${dc?"bg-gray-800":"bg-white"}`}>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><BarChart3 size={14} className="text-purple-500"/> Leave Balances</h3>
                    <div className="space-y-4">
                      {activeEmployees.sort(sortByEmpId).map(emp=>{
                        const pct=(emp.remainingLeaves/emp.totalLeaves)*100;
                        return (
                          <div key={emp.id}>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className={`font-medium truncate max-w-[130px] ${dc?"text-gray-300":"text-gray-700"}`}>{emp.name}</span>
                              <span className={`font-bold ${emp.remainingLeaves<=3?"text-rose-500":dc?"text-gray-300":"text-gray-600"}`}>{emp.remainingLeaves}/{emp.totalLeaves}</span>
                            </div>
                            <div className={`h-1.5 rounded-full ${dc?"bg-gray-700":"bg-gray-100"}`}>
                              <div className={`h-1.5 rounded-full transition-all duration-500 ${pct>50?"bg-emerald-500":pct>20?"bg-amber-500":"bg-rose-500"}`} style={{width:`${pct}%`}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Holidays + import */}
                  <div className={`rounded-2xl shadow-lg p-5 ${dc?"bg-gray-800":"bg-white"}`}>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><CalendarOff size={14} className="text-purple-500"/> Holidays</h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button onClick={()=>setShowHolidayForm(true)}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium ${dc?"bg-purple-900/30 hover:bg-purple-900/50 text-purple-300":"bg-purple-50 hover:bg-purple-100 text-purple-700"}`}>
                        <Plus size={11}/> Add
                      </button>
                      <input ref={holidayCsvRef} type="file" accept=".csv" className="hidden" onChange={handleHolidayCSV}/>
                      <button onClick={downloadHolidayTemplate}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium ${dc?"bg-gray-700 hover:bg-gray-600 text-gray-300":"bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
                        <Download size={11}/> Template
                      </button>
                      <button onClick={()=>holidayCsvRef.current?.click()}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium ${dc?"bg-gray-700 hover:bg-gray-600 text-gray-300":"bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
                        <Upload size={11}/> Import CSV
                      </button>
                    </div>
                    {holidays.length===0&&<p className={`text-xs ${dc?"text-gray-500":"text-gray-400"}`}>No holidays added yet.</p>}
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {holidays.sort((a,b)=>a.date.localeCompare(b.date)).map(h=>(
                        <div key={h.date} className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-medium ${dc?"text-gray-300":"text-gray-700"}`}>{h.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${h.type==="company"?"bg-sky-100 text-sky-600":"bg-purple-100 text-purple-600"}`}>{h.type==="company"?"Co.":"Pub."}</span>
                            </div>
                            <div className={`text-xs ${dc?"text-gray-500":"text-gray-400"}`}>{fmtDate(h.date)}{h.considerAttendance?" · tracked":""}</div>
                          </div>
                          <button onClick={()=>removeHoliday(h.date)} className={`${dc?"text-gray-600 hover:text-rose-400":"text-gray-300 hover:text-rose-500"} transition-colors`}><Trash2 size={12}/></button>
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

      {/* ── Late Start Time Modal ────────────────────────────────────────────── */}
      {lateStartModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-xs p-6 ${dc?"bg-gray-800":"bg-white"}`}>
            <h3 className="text-base font-bold mb-1">Late Start Request</h3>
            <p className={`text-xs mb-4 ${dc?"text-gray-400":"text-gray-500"}`}>
              {employees.find(e=>e.id===lateStartModal.empId)?.name} · {fmtDate(selectedDate)}
            </p>
            {(()=>{
              const emp=employees.find(e=>e.id===lateStartModal.empId);
              const monthStr=selectedDate.slice(0,7);
              const used=emp?getLateStartCount(emp.id,monthStr):0;
              const limit=emp?.lateStartLimit??2;
              return used>=limit?(
                <div className={`flex items-center gap-2 p-2 rounded-lg mb-4 ${dc?"bg-rose-900/30":"bg-rose-50"}`}>
                  <AlertTriangle size={14} className="text-rose-500 shrink-0"/>
                  <p className={`text-xs ${dc?"text-rose-300":"text-rose-700"}`}>⚠ Limit reached: {used}/{limit} late starts this month. You can still proceed.</p>
                </div>
              ):null;
            })()}
            <label className={labelCls}>Entry Time</label>
            <input type="time" value={lateStartTime} onChange={e=>setLateStartTime(e.target.value)} autoFocus
              className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-orange-500 mb-4 ${dc?"bg-gray-700 border-gray-600 text-white":"border-gray-200"}`}/>
            <div className="flex gap-2">
              <button onClick={()=>setLateStartModal(null)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${dc?"bg-gray-700 hover:bg-gray-600":"bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={confirmLateStart} className="flex-1 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Late Start Limit Warning (after limit, still allows) ─────────────── */}
      {lateStartWarning&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm p-6 ${dc?"bg-gray-800":"bg-white"}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center"><AlertTriangle size={20} className="text-rose-600"/></div>
              <h3 className="text-base font-bold">Late Start Limit Exceeded</h3>
            </div>
            <p className={`text-sm mb-5 ${dc?"text-gray-300":"text-gray-600"}`}>
              <strong>{lateStartWarning.empName}</strong> has used <strong>{lateStartWarning.used}</strong> of <strong>{lateStartWarning.limit}</strong> allowed late starts this month.<br/><br/>
              The entry has been recorded. Please follow up as needed.
            </p>
            <button onClick={()=>{
              if(pendingEntry) commitEntry(pendingEntry.empId,pendingEntry.inTime,pendingEntry.status);
              setPendingEntry(null); setLateStartWarning(null);
            }} className="w-full py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white">OK, Understood</button>
          </div>
        </div>
      )}

      {/* ── Holiday Override Warning ─────────────────────────────────────────── */}
      {holidayWarning&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm p-6 ${dc?"bg-gray-800":"bg-white"}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><AlertTriangle size={20} className="text-amber-600"/></div>
              <h3 className="text-base font-bold">Holiday Override</h3>
            </div>
            <p className={`text-sm mb-5 ${dc?"text-gray-300":"text-gray-600"}`}>
              <strong>{fmtDate(selectedDate)}</strong> is a holiday (<strong>{getHoliday(selectedDate)?.name}</strong>) with attendance tracking off.<br/><br/>
              This will <strong>not</strong> deduct from leave balance. Proceed?
            </p>
            <div className="flex gap-3">
              <button onClick={()=>{setHolidayWarning(false);setPendingEntry(null);}} className={`flex-1 py-2 rounded-lg text-sm font-medium ${dc?"bg-gray-700 hover:bg-gray-600":"bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={confirmHolidayOverride} className="flex-1 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white">Mark Anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Employee Form Modal ──────────────────────────────────────────────── */}
      {showEmpForm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto ${dc?"bg-gray-800":"bg-white"}`}>
            <div className={`sticky top-0 flex items-center justify-between p-6 pb-4 border-b ${dc?"bg-gray-800 border-gray-700":"bg-white border-gray-100"}`}>
              <h3 className="text-base font-bold">{editingEmp?"Edit Employee":"Add New Employee"}</h3>
              <button onClick={()=>setShowEmpForm(false)} className={`p-1.5 rounded-lg ${dc?"hover:bg-gray-700":"hover:bg-gray-100"}`}><X size={16}/></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Identity */}
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${dc?"text-gray-400":"text-gray-400"}`}>Identity</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {fi("Employee ID *","employeeId")}
                  {fi("Full Name *","name")}
                  {fi("Designation","designation")}
                  {fi("Department","department")}
                  <div>
                    <label className={labelCls}>Reports To</label>
                    <select value={empForm.reportsTo} onChange={e=>setEmpForm(f=>({...f,reportsTo:e.target.value}))} className={inputCls}>
                      <option value="">None</option>
                      {employees.filter(e=>!editingEmp||e.id!==editingEmp.id).sort(sortByEmpId).map(e=>(
                        <option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>
                      ))}
                    </select>
                  </div>
                  {fi("Blood Group","bloodGroup","text",BLOOD_GROUPS)}
                </div>
              </div>
              {/* Employment */}
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${dc?"text-gray-400":"text-gray-400"}`}>Employment</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Employment Type</label>
                    <select value={empForm.employmentType} onChange={e=>setEmpForm(f=>({...f,employmentType:e.target.value as EmploymentType}))} className={inputCls}>
                      <option value="full-time">Full-time</option>
                      <option value="part-time">Part-time</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Position Type</label>
                    <select value={empForm.positionType} onChange={e=>setEmpForm(f=>({...f,positionType:e.target.value as PositionType}))} className={inputCls}>
                      <option value="permanent">Permanent</option>
                      <option value="contractual">Contractual</option>
                    </select>
                  </div>
                  {fi("Joining Date","joiningDate","date")}
                  {fi("Cessation Date","cessationDate","date")}
                  <div>
                    <label className={labelCls}>Total Leaves / Year</label>
                    <input type="number" value={empForm.totalLeaves}
                      onChange={e=>setEmpForm(f=>({...f,totalLeaves:Number(e.target.value),remainingLeaves:Number(e.target.value)}))} className={inputCls}/>
                  </div>
                  <div>
                    <label className={labelCls}>Late Start Limit / Month</label>
                    <input type="number" min={0} value={empForm.lateStartLimit}
                      onChange={e=>setEmpForm(f=>({...f,lateStartLimit:Number(e.target.value)}))} className={inputCls}/>
                  </div>
                </div>
                {/* Part-time schedule */}
                {empForm.employmentType==="part-time"&&(
                  <div className={`mt-4 p-4 rounded-xl border ${dc?"bg-gray-700/50 border-gray-600":"bg-amber-50 border-amber-200"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${dc?"text-amber-400":"text-amber-600"}`}>Part-time Schedule</p>
                    <div className="mb-3">
                      <label className={labelCls}>Working Days</label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day,idx)=>{
                          const checked=empForm.workingDays.includes(idx);
                          return (
                            <button key={day} type="button"
                              onClick={()=>setEmpForm(f=>({...f,workingDays:checked?f.workingDays.filter(d=>d!==idx):[...f.workingDays,idx].sort()}))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                                ${checked?"bg-blue-600 border-blue-600 text-white":dc?"bg-gray-700 border-gray-600 text-gray-300 hover:border-blue-500":"bg-white border-gray-200 text-gray-600 hover:border-blue-400"}`}>
                              {DAYS_SHORT[idx]}
                            </button>
                          );
                        })}
                      </div>
                      <p className={`text-xs mt-1 ${dc?"text-gray-500":"text-gray-400"}`}>{empForm.workingDays.length} day{empForm.workingDays.length!==1?"s":""} selected</p>
                    </div>
                    <div>
                      <label className={labelCls}>Working Hours (free text)</label>
                      <input type="text" value={empForm.workingHours} onChange={e=>setEmpForm(f=>({...f,workingHours:e.target.value}))}
                        placeholder="e.g. 10:00–14:00 or 4 hours/day" className={inputCls}/>
                    </div>
                  </div>
                )}
              </div>
              {/* Contact */}
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${dc?"text-gray-400":"text-gray-400"}`}>Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {phoneField("Phone Number","phoneCode","phone")}
                  {phoneField("Emergency Contact","emergencyCode","emergencyContact")}
                  {fi("Personal Email","email","email")}
                  {fi("Company Email","companyEmail","email")}
                  <div className="sm:col-span-2">{fi("Present Address","presentAddress")}</div>
                </div>
              </div>
              {/* Personal */}
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${dc?"text-gray-400":"text-gray-400"}`}>Personal</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {fi("Birthday","birthday","date")}
                </div>
              </div>
            </div>
            <div className={`sticky bottom-0 flex gap-3 p-6 pt-4 border-t ${dc?"bg-gray-800 border-gray-700":"bg-white border-gray-100"}`}>
              <button onClick={()=>setShowEmpForm(false)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${dc?"bg-gray-700 hover:bg-gray-600":"bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={saveEmployee} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2">
                <Save size={14}/>{editingEmp?"Save Changes":"Add Employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Holiday Form ─────────────────────────────────────────────────────── */}
      {showHolidayForm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm ${dc?"bg-gray-800":"bg-white"}`}>
            <div className="flex items-center justify-between p-6 pb-4">
              <h3 className="text-base font-bold">Add Holiday</h3>
              <button onClick={()=>setShowHolidayForm(false)} className={`p-1.5 rounded-lg ${dc?"hover:bg-gray-700":"hover:bg-gray-100"}`}><X size={16}/></button>
            </div>
            <div className="px-6 pb-4 space-y-3">
              <div><label className={labelCls}>Date *</label>
                <input type="date" value={newHoliday.date} onChange={e=>setNewHoliday(h=>({...h,date:e.target.value}))}
                  className={inputCls}/></div>
              <div><label className={labelCls}>Holiday Name *</label>
                <input value={newHoliday.name} onChange={e=>setNewHoliday(h=>({...h,name:e.target.value}))} placeholder="e.g. Eid ul-Fitr"
                  className={inputCls}/></div>
              <div><label className={labelCls}>Type</label>
                <select value={newHoliday.type} onChange={e=>setNewHoliday(h=>({...h,type:e.target.value as HolidayType}))} className={inputCls}>
                  <option value="public">Public Holiday</option>
                  <option value="company">Company Holiday</option>
                </select></div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={newHoliday.considerAttendance} onChange={e=>setNewHoliday(h=>({...h,considerAttendance:e.target.checked}))} className="w-4 h-4 rounded"/>
                <div>
                  <div className="text-sm font-medium">Track attendance on this day</div>
                  <div className={`text-xs ${dc?"text-gray-400":"text-gray-500"}`}>Off = shows warning before marking. Won't deduct leave.</div>
                </div>
              </label>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={()=>setShowHolidayForm(false)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${dc?"bg-gray-700 hover:bg-gray-600":"bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={addHoliday} className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white">Add Holiday</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Note Modal ───────────────────────────────────────────────────────── */}
      {noteModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm ${dc?"bg-gray-800":"bg-white"}`}>
            <div className="flex items-center justify-between p-6 pb-4">
              <div>
                <h3 className="text-base font-bold">{noteModal.field==="note"?"📝 Add Note":"⚠️ Late Reason"}</h3>
                <p className={`text-xs ${dc?"text-gray-400":"text-gray-500"}`}>{employees.find(e=>e.id===noteModal.empId)?.name} · {fmtDate(selectedDate)}</p>
              </div>
              <button onClick={()=>setNoteModal(null)} className={`p-1.5 rounded-lg ${dc?"hover:bg-gray-700":"hover:bg-gray-100"}`}><X size={16}/></button>
            </div>
            <div className="px-6 pb-4">
              <textarea value={noteValue} onChange={e=>setNoteValue(e.target.value)} rows={3}
                placeholder={noteModal.field==="note"?"e.g. Client visit…":"e.g. Traffic, medical appointment…"}
                className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 resize-none ${dc?"bg-gray-700 border-gray-600 text-white":"border-gray-200"}`}/>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={()=>setNoteModal(null)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${dc?"bg-gray-700 hover:bg-gray-600":"bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
              <button onClick={()=>{
                setRecords(prev=>prev.map(r=>r.date===selectedDate&&r.employeeId===noteModal.empId?{...r,[noteModal.field]:noteValue}:r));
                setNoteModal(null);
              }} className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
