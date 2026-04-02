"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Clock, UserX, Home, Coffee, BarChart3, Plus, Trash2, Download,
  CalendarDays, StickyNote, AlertTriangle, CalendarOff, Search,
  Sun, Moon, Users, XCircle, TrendingUp,
  ChevronLeft, ChevronRight, Filter, Edit2, Save, X, Cake,
  Upload, Bell, GitBranch,
  LayoutGrid, Ban, Star, History, UserCheck
} from "lucide-react";
import {
  format, isBefore, isAfter, parse, getDaysInMonth, startOfMonth,
  getDay, isToday, parseISO, differenceInDays
} from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
type AttendanceStatus =
  | "Early" | "On Time" | "Late" | "Absent" | "WFH" | "Leave"
  | "Late Start Request" | "Holiday" | "Day Off";
type MainTab        = "employees" | "attendance";
type EmpSubView     = "current" | "former";
type EmpView        = "tiles" | "organogram";
type AttendanceView = "daily" | "calendar" | "summary";
type HolidayType    = "public" | "company";
type EmploymentType = "full-time" | "part-time";
type PositionType   = "permanent" | "contractual";

const DAYS_OF_WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYS_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS       = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// 4-level org colours (red/black/white palette)
const ORG_LEVEL_STYLES = [
  { bg:"bg-red-600",      ring:"border-red-600",     label:"CEO Level"      },
  { bg:"bg-red-900",      ring:"border-red-900",     label:"VP Level"       },
  { bg:"bg-black",        ring:"border-black",       label:"Dept Head Level" },
  { bg:"bg-gray-500",     ring:"border-gray-500",    label:"Staff Level"    },
];

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  reportsTo: string;
  isCsuite: boolean;
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
  lateStartLimit: number;
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
    isCsuite: e.isCsuite ?? false,
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

const EMPTY_EMP: Omit<Employee,"id"> = {
  employeeId:"", name:"", designation:"", department:"", reportsTo:"",
  isCsuite:false, bloodGroup:"", phoneCode:"+880", phone:"",
  emergencyCode:"+880", emergencyContact:"", email:"", companyEmail:"",
  presentAddress:"", birthday:"", joiningDate:"", cessationDate:"",
  employmentType:"full-time", positionType:"permanent",
  workingDays:[1,2,3,4,5], workingHours:"",
  totalLeaves:20, remainingLeaves:20, lateStartLimit:2,
};

const DEFAULT_EMPLOYEES: Employee[] = [
  migrateEmployee({ id:"1", employeeId:"ANTS-001", name:"Alice Johnson", designation:"Lead Engineer", department:"Engineering", bloodGroup:"B+", phone:"01700000001", email:"alice@gmail.com", companyEmail:"alice@antsdronehub.com", presentAddress:"Dhaka", birthday:"1995-03-15", joiningDate:"2022-01-10" }),
  migrateEmployee({ id:"2", employeeId:"ANTS-002", name:"Bob Smith", designation:"CEO", department:"Management", isCsuite:true, bloodGroup:"O+", phone:"01700000003", email:"bob@gmail.com", companyEmail:"bob@antsdronehub.com", presentAddress:"Chittagong", birthday:"1990-07-22", joiningDate:"2021-06-01" }),
];

// ─── Status styles ────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  "Early":              "bg-gray-800 text-white",
  "On Time":            "bg-black text-white",
  "Late":               "bg-red-600 text-white",
  "Absent":             "bg-red-100 text-red-800",
  "WFH":                "bg-gray-600 text-white",
  "Leave":              "bg-red-200 text-red-900",
  "Late Start Request": "bg-red-500 text-white",
  "Holiday":            "bg-gray-200 text-gray-800",
  "Day Off":            "bg-gray-100 text-gray-500",
};
const STATUS_DOT: Record<string, string> = {
  "Early":"bg-gray-700", "On Time":"bg-black", "Late":"bg-red-600",
  "Absent":"bg-red-300", "WFH":"bg-gray-500", "Leave":"bg-red-400",
  "Late Start Request":"bg-red-500", "Holiday":"bg-gray-400", "Day Off":"bg-gray-300",
};

const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) => {
  if (!iso) return "—";
  try { return format(parseISO(iso),"dd/MM/yyyy"); } catch { return iso; }
};

function sortByEmpId(a: Employee, b: Employee) {
  return a.employeeId.localeCompare(b.employeeId, undefined, { numeric:true });
}
function groupByDept(emps: Employee[]): Record<string,Employee[]> {
  const g: Record<string,Employee[]> = {};
  [...emps].sort(sortByEmpId).forEach(e => {
    const d = e.department || "Unassigned";
    if (!g[d]) g[d] = [];
    g[d].push(e);
  });
  return g;
}
function getUpcomingBirthdays(employees: Employee[], days=7) {
  const today = new Date();
  return employees.filter(e => !e.cessationDate && e.birthday).map(e => {
    const b = parseISO(e.birthday);
    let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
    if (isBefore(next, today)) next = new Date(today.getFullYear()+1, b.getMonth(), b.getDate());
    return { ...e, daysUntil: differenceInDays(next, today) };
  }).filter(e => e.daysUntil >= 0 && e.daysUntil <= days);
}
function getUpcomingHolidays(holidays: Holiday[], days=7) {
  const today = new Date();
  return holidays.filter(h => {
    const diff = differenceInDays(parseISO(h.date), today);
    return diff >= 0 && diff <= days;
  }).map(h => ({ ...h, daysUntil: differenceInDays(parseISO(h.date), today) }));
}

// Cessation alerts: contractual always, others if cessation date set — within 45 days
function getCessationAlerts(employees: Employee[]) {
  const today = new Date();
  return employees.filter(e => {
    if (!e.cessationDate) return false;
    const diff = differenceInDays(parseISO(e.cessationDate), today);
    return diff >= 0 && diff <= 45;
  }).map(e => ({
    ...e,
    daysUntil: differenceInDays(parseISO(e.cessationDate), today),
  }));
}

// Add 15 mins to office time to get late threshold
function addMinutes(timeStr: string, mins: number): string {
  try {
    const d = parse(timeStr,"HH:mm", new Date());
    d.setMinutes(d.getMinutes() + mins);
    return format(d,"HH:mm");
  } catch { return timeStr; }
}

// Determine attendance status from entry time
function computeStatus(inTime: string, officeTime: string, lateTime: string): AttendanceStatus {
  try {
    const entry  = parse(inTime,"HH:mm", new Date());
    const office = parse(officeTime,"HH:mm", new Date());
    const late   = parse(lateTime,"HH:mm", new Date());
    if (isNaN(entry.getTime())) return "On Time";
    if (isBefore(entry, office)) return "Early";
    if (isAfter(entry, late))    return "Late";
    return "On Time";
  } catch { return "On Time"; }
}

const EMP_CSV_HEADERS = ["Employee ID","Full Name","Designation","Department","Blood Group","Phone","Personal Email","Company Email","Present Address","Birthday (YYYY-MM-DD)","Joining Date (YYYY-MM-DD)","Employment Type","Position Type","Total Leaves"];
const HOLIDAY_CSV_HEADERS = ["Date (YYYY-MM-DD)","Holiday Name","Type (public/company)"];

// ═══════════════════════════════════════════════════════════════════════════════
export default function HRDashboard() {
  const [employees,      setEmployees]      = useState<Employee[]>(DEFAULT_EMPLOYEES);
  const [records,        setRecords]        = useState<AttendanceRecord[]>([]);
  const [holidays,       setHolidays]       = useState<Holiday[]>([]);
  const [officeTime,     setOfficeTime]     = useState("09:00");
  const [selectedDate,   setSelectedDate]   = useState(format(new Date(),"yyyy-MM-dd"));
  const [isHydrated,     setIsHydrated]     = useState(false);
  const [darkMode,       setDarkMode]       = useState(false);
  const [mainTab,        setMainTab]        = useState<MainTab>("attendance");
  const [empSubView,     setEmpSubView]     = useState<EmpSubView>("current");
  const [empView,        setEmpView]        = useState<EmpView>("tiles");
  const [attendanceView, setAttendanceView] = useState<AttendanceView>("daily");
  const [searchQuery,    setSearchQuery]    = useState("");
  const [deptFilter,     setDeptFilter]     = useState("All");
  const [calendarEmpId,  setCalendarEmpId]  = useState("");
  const [calendarMonth,  setCalendarMonth]  = useState(new Date());
  const [summaryMonth,   setSummaryMonth]   = useState(format(new Date(),"yyyy-MM"));

  const [showEmpForm,     setShowEmpForm]    = useState(false);
  const [editingEmp,      setEditingEmp]     = useState<Employee|null>(null);
  const [empForm,         setEmpForm]        = useState<Omit<Employee,"id">>(EMPTY_EMP);
  const [showHolidayForm, setShowHolidayForm]= useState(false);
  const [newHoliday,      setNewHoliday]     = useState({ date:"", name:"", type:"public" as HolidayType, considerAttendance:false });
  const [holidayWarning,  setHolidayWarning] = useState(false);
  const [lateStartWarning,setLateStartWarning]=useState<{empName:string;used:number;limit:number}|null>(null);
  const [pendingEntry,    setPendingEntry]   = useState<{empId:string;inTime:string;status?:AttendanceStatus}|null>(null);
  const [lateStartModal,  setLateStartModal] = useState<{empId:string}|null>(null);
  const [lateStartTime,   setLateStartTime]  = useState("");
  const [noteModal,       setNoteModal]      = useState<{empId:string;field:"note"|"lateReason"}|null>(null);
  const [noteValue,       setNoteValue]      = useState("");

  const empCsvRef     = useRef<HTMLInputElement>(null);
  const holidayCsvRef = useRef<HTMLInputElement>(null);

  // Derived late time = office time + 15 min
  const lateTime = useMemo(() => addMinutes(officeTime, 15), [officeTime]);

  // ─── Hydration ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const raw = load<Partial<Employee>[]>("ants_employees",[]);
    setEmployees(raw.length > 0 ? raw.map(migrateEmployee) : DEFAULT_EMPLOYEES);
    setRecords(load<AttendanceRecord[]>("ants_records",[]));
    setHolidays(load<Holiday[]>("ants_holidays",[]));
    setOfficeTime(load<string>("ants_office_time","09:00"));
    setDarkMode(load<boolean>("ants_dark",false));
    setIsHydrated(true);
  }, []);
  useEffect(() => { if (isHydrated) save("ants_records",      records);    }, [records,     isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_employees",    employees);  }, [employees,   isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_holidays",     holidays);   }, [holidays,    isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_dark",         darkMode);   }, [darkMode,    isHydrated]);
  useEffect(() => { if (isHydrated) save("ants_office_time",  officeTime); }, [officeTime,  isHydrated]);
  useEffect(() => { if (employees.length > 0 && !calendarEmpId) setCalendarEmpId(employees[0].id); }, [employees, calendarEmpId]);

  // ─── Theme ────────────────────────────────────────────────────────────────
  const bg       = darkMode ? "bg-[#0a0a0a]"    : "bg-white";
  const surface  = darkMode ? "bg-[#141414]"    : "bg-white";

  const border   = darkMode ? "border-[#2a2a2a]": "border-gray-200";
  const txt      = darkMode ? "text-white"       : "text-black";
  const txtMuted = darkMode ? "text-gray-400"    : "text-gray-500";
  const txtSub   = darkMode ? "text-gray-500"    : "text-gray-400";
  const cardCls  = `rounded-2xl border shadow-sm ${surface} ${border}`;
  const inputCls = `w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-red-500 ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-white":"bg-white border-gray-200 text-black"}`;
  const labelCls = `text-xs font-medium block mb-1 ${txtMuted}`;
  const btnGhost = `flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${darkMode?"border-[#2a2a2a] text-gray-300 hover:border-red-600 hover:text-red-400":"border-gray-200 text-gray-600 hover:border-red-500 hover:text-red-600"}`;

  // ─── Derived ────────────────────────────────────────────────────────────────
  const today = new Date();
  const todayStr = format(today,"yyyy-MM-dd");

  // Active = no cessation date OR cessation date in future
  const activeEmployees = useMemo(() =>
    employees.filter(e => !e.cessationDate || isAfter(parseISO(e.cessationDate), today)),
    [employees]);
  const formerEmployees = useMemo(() =>
    employees.filter(e => e.cessationDate && !isAfter(parseISO(e.cessationDate), today)),
    [employees]);

  const allDepts    = useMemo(() => Array.from(new Set(employees.map(e=>e.department).filter(Boolean))).sort(), [employees]);
  const departments = useMemo(() => ["All",...allDepts], [allDepts]);

  const filteredAttendanceEmps = useMemo(() => activeEmployees.filter(e => {
    const ms = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
    const md = deptFilter==="All" || e.department===deptFilter;
    return ms && md;
  }), [activeEmployees, searchQuery, deptFilter]);

  const attendanceGroups = useMemo(() => groupByDept(filteredAttendanceEmps), [filteredAttendanceEmps]);
  const getHoliday = (date: string) => holidays.find(h=>h.date===date);

  const todayStats = useMemo(() => {
    const tr = records.filter(r=>r.date===todayStr);
    return {
      total:    activeEmployees.length,
      present:  tr.filter(r=>r.status==="On Time"||r.status==="Early"||r.status==="Late Start Request").length,
      early:    tr.filter(r=>r.status==="Early").length,
      late:     tr.filter(r=>r.status==="Late").length,
      wfh:      tr.filter(r=>r.status==="WFH").length,
      onLeave:  tr.filter(r=>r.status==="Leave").length,
      absent:   tr.filter(r=>r.status==="Absent").length,
    };
  }, [records, activeEmployees, todayStr]);

  const upcomingBirthdays  = useMemo(() => getUpcomingBirthdays(activeEmployees), [activeEmployees]);
  const upcomingHolidays   = useMemo(() => getUpcomingHolidays(holidays), [holidays]);
  const cessationAlerts    = useMemo(() => getCessationAlerts(activeEmployees), [activeEmployees]);

  const availableMonths = useMemo(() => {
    const months = new Set(records.map(r=>r.date.slice(0,7)));
    months.add(format(new Date(),"yyyy-MM"));
    return Array.from(months).sort().reverse();
  }, [records]);

  // ─── Late start count ────────────────────────────────────────────────────────
  const getLateStartCount = (empId: string, monthStr: string) =>
    records.filter(r=>r.employeeId===empId&&r.status==="Late Start Request"&&r.date.startsWith(monthStr)).length;

  // ─── Monthly summary ─────────────────────────────────────────────────────────
  const getMonthlySummary = (empId: string, monthStr: string) => {
    const er = records.filter(r=>r.employeeId===empId&&r.date.startsWith(monthStr));
    return {
      early:     er.filter(r=>r.status==="Early").length,
      onTime:    er.filter(r=>r.status==="On Time").length,
      late:      er.filter(r=>r.status==="Late").length,
      leave:     er.filter(r=>r.status==="Leave").length,
      wfh:       er.filter(r=>r.status==="WFH").length,
      absent:    er.filter(r=>r.status==="Absent").length,
      lateStart: er.filter(r=>r.status==="Late Start Request").length,
    };
  };

  // ─── Attendance ──────────────────────────────────────────────────────────────
  const commitEntry = (empId: string, inTime: string, status?: AttendanceStatus) => {
    let finalStatus: AttendanceStatus;
    if (status) {
      finalStatus = status;
    } else {
      finalStatus = computeStatus(inTime, officeTime, lateTime);
    }
    const existing  = records.find(r=>r.date===selectedDate&&r.employeeId===empId);
    const wasLeave  = existing?.status==="Leave";
    const isNowLeave = finalStatus==="Leave";
    setRecords(prev=>[
      ...prev.filter(r=>!(r.date===selectedDate&&r.employeeId===empId)),
      { date:selectedDate, employeeId:empId, status:finalStatus, inTime,
        note:existing?.note??"", lateReason:existing?.lateReason??"" },
    ]);
    if (isNowLeave && !wasLeave) setEmployees(prev=>prev.map(e=>e.id===empId?{...e,remainingLeaves:Math.max(0,e.remainingLeaves-1)}:e));
    if (!isNowLeave && wasLeave) setEmployees(prev=>prev.map(e=>e.id===empId?{...e,remainingLeaves:Math.min(e.totalLeaves,e.remainingLeaves+1)}:e));
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

  const openLateStartModal = (empId: string) => { setLateStartModal({ empId }); setLateStartTime(""); };

  const confirmLateStart = () => {
    if (!lateStartModal) return;
    const { empId } = lateStartModal;
    const emp = employees.find(e=>e.id===empId);
    if (!emp) return;
    const monthStr = selectedDate.slice(0,7);
    const used = getLateStartCount(empId, monthStr);
    if (used >= emp.lateStartLimit) {
      setLateStartWarning({ empName:emp.name, used, limit:emp.lateStartLimit });
      setPendingEntry({ empId, inTime:lateStartTime||"00:00", status:"Late Start Request" });
      setLateStartModal(null);
      return;
    }
    commitEntry(empId, lateStartTime||"00:00","Late Start Request");
    setLateStartModal(null);
  };

  const confirmHolidayOverride = () => {
    if (pendingEntry) commitEntry(pendingEntry.empId, pendingEntry.inTime, pendingEntry.status);
    setHolidayWarning(false); setPendingEntry(null);
  };

  const clearEntry = (empId: string) => {
    const existing = records.find(r=>r.date===selectedDate&&r.employeeId===empId);
    if (existing?.status==="Leave") setEmployees(prev=>prev.map(e=>e.id===empId?{...e,remainingLeaves:Math.min(e.totalLeaves,e.remainingLeaves+1)}:e));
    setRecords(prev=>prev.filter(r=>!(r.date===selectedDate&&r.employeeId===empId)));
  };

  // ─── Employee CRUD ───────────────────────────────────────────────────────────
  const openAddEmp  = () => { setEditingEmp(null); setEmpForm(EMPTY_EMP); setShowEmpForm(true); };
  const openEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...rest } = emp;
    setEmpForm(rest);
    setShowEmpForm(true);
  };
  const saveEmployee = () => {
    if (!empForm.name.trim()) return;
    if (editingEmp) setEmployees(prev=>prev.map(e=>e.id===editingEmp.id?{...empForm,id:editingEmp.id}:e));
    else            setEmployees(prev=>[...prev,{...empForm,id:Date.now().toString()}]);
    setShowEmpForm(false);
  };
  const removeEmployee = (id: string) => {
    if (!confirm("Remove this employee permanently? Records remain.")) return;
    setEmployees(prev=>prev.filter(e=>e.id!==id));
  };

  // ─── Holidays ───────────────────────────────────────────────────────────────
  const addHoliday = () => {
    if (!newHoliday.date||!newHoliday.name.trim()) return;
    setHolidays(prev=>[...prev.filter(h=>h.date!==newHoliday.date),{...newHoliday}]);
    setNewHoliday({ date:"",name:"",type:"public",considerAttendance:false });
    setShowHolidayForm(false);
  };
  const removeHoliday = (date: string) => setHolidays(prev=>prev.filter(h=>h.date!==date));

  // ─── CSV ─────────────────────────────────────────────────────────────────────
  const handleEmpCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ const lines=(ev.target?.result as string).split("\n").filter(Boolean).slice(1); let c=0; const imported=lines.map(line=>{ const p=line.split(",").map(s=>s.replace(/"/g,"").trim()); c++; return migrateEmployee({ id:Date.now().toString()+c, employeeId:p[0],name:p[1],designation:p[2],department:p[3],bloodGroup:p[4],phone:p[5],email:p[6],companyEmail:p[7],presentAddress:p[8],birthday:p[9],joiningDate:p[10],employmentType:p[11]==="part-time"?"part-time":"full-time",positionType:p[12]==="contractual"?"contractual":"permanent",totalLeaves:parseInt(p[13])||20,remainingLeaves:parseInt(p[13])||20 }); }).filter(e=>e.name); if(imported.length){ setEmployees(prev=>{ const m=new Map(prev.map(e=>[e.employeeId,e])); imported.forEach(e=>m.set(e.employeeId,e)); return Array.from(m.values()); }); alert(`✅ Imported ${imported.length} employees.`); } else alert("❌ No valid rows."); };
    reader.readAsText(file); e.target.value="";
  };
  const handleHolidayCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ const parsed:Holiday[]=[]; (ev.target?.result as string).split("\n").forEach(line=>{ const p=line.split(",").map(s=>s.replace(/"/g,"").trim()); if(p[0]?.match(/^\d{4}-\d{2}-\d{2}$/)) parsed.push({date:p[0],name:p[1]||"Holiday",type:p[2]==="company"?"company":"public",considerAttendance:false}); }); if(parsed.length){ setHolidays(prev=>{ const m=new Map(prev.map(h=>[h.date,h])); parsed.forEach(h=>m.set(h.date,h)); return Array.from(m.values()); }); alert(`✅ Imported ${parsed.length} holidays.`); } else alert("❌ No valid rows."); };
    reader.readAsText(file); e.target.value="";
  };
  const dl=(rows:string[][],fn:string)=>{ const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n"); const b=new Blob([csv],{type:"text/csv"}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=fn; a.click(); URL.revokeObjectURL(u); };
  const exportAttendanceCSV=()=>{ const rows=[["Date","Employee ID","Name","Designation","Department","Employment","Position","Status","In Time","Note","Late Reason"]]; records.forEach(r=>{ const emp=employees.find(e=>e.id===r.employeeId); rows.push([fmtDate(r.date),emp?.employeeId||"",emp?.name||"",emp?.designation||"",emp?.department||"",emp?.employmentType||"",emp?.positionType||"",r.status,r.inTime,r.note,r.lateReason]); }); dl(rows,"ants_attendance.csv"); };
  const exportEmployeesCSV=()=>{ const rows=[EMP_CSV_HEADERS]; employees.forEach(e=>rows.push([e.employeeId,e.name,e.designation,e.department,e.bloodGroup,`${e.phoneCode} ${e.phone}`,e.email,e.companyEmail,e.presentAddress,e.birthday,e.joiningDate,e.employmentType,e.positionType,String(e.totalLeaves)])); dl(rows,"ants_employees.csv"); };
  const dlEmpTpl=()=>dl([EMP_CSV_HEADERS,["ANTS-003","Jane Doe","Engineer","Engineering","A+","01700000099","jane@gmail.com","jane@antsdronehub.com","Dhaka","1998-05-10","2024-01-15","full-time","permanent","20"]],"ants_employees_template.csv");
  const dlHolTpl=()=>dl([HOLIDAY_CSV_HEADERS,["2026-02-21","International Mother Language Day","public"]],"ants_holidays_template.csv");

  // ─── Form helpers ────────────────────────────────────────────────────────────
  const fi=(label:string,key:keyof Omit<Employee,"id">,type="text",opts?:string[])=>(
    <div><label className={labelCls}>{label}</label>
      {opts?<select value={empForm[key] as string} onChange={e=>setEmpForm(f=>({...f,[key]:e.target.value}))} className={inputCls}><option value="">Select…</option>{opts.map(o=><option key={o}>{o}</option>)}</select>
        :<input type={type} value={empForm[key] as string} onChange={e=>setEmpForm(f=>({...f,[key]:e.target.value}))} className={inputCls}/>}
    </div>
  );
  const phoneField=(label:string,codeKey:keyof Omit<Employee,"id">,numKey:keyof Omit<Employee,"id">)=>(
    <div><label className={labelCls}>{label}</label>
      <div className="flex gap-2">
        <select value={empForm[codeKey] as string} onChange={e=>setEmpForm(f=>({...f,[codeKey]:e.target.value}))} className={`rounded-lg px-2 py-2 text-sm border outline-none w-24 ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-white":"border-gray-200"}`}><option value="+880">🇧🇩 +880</option></select>
        <input type="tel" value={empForm[numKey] as string} onChange={e=>setEmpForm(f=>({...f,[numKey]:e.target.value}))} placeholder="01XXXXXXXXX" className={`flex-1 rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-red-500 ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-white":"border-gray-200"}`}/>
      </div>
    </div>
  );
  const sectionTitle=(label:string)=><p className={`text-xs font-bold uppercase tracking-wider mb-3 ${txtMuted}`}>{label}</p>;

  // ─── Calendar ────────────────────────────────────────────────────────────────
  const CalendarView=()=>{
    const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth();
    const days=getDaysInMonth(calendarMonth),first=getDay(startOfMonth(calendarMonth));
    const getCellStatus=(day:number):AttendanceStatus|null=>{ const ds=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; if(getHoliday(ds)) return "Holiday"; return records.find(r=>r.date===ds&&r.employeeId===calendarEmpId)?.status||null; };
    return (
      <div className={`${cardCls} p-6`}>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <select value={calendarEmpId} onChange={e=>setCalendarEmpId(e.target.value)} className={`rounded-lg px-3 py-2 text-sm border ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-white":"border-gray-200"}`}>
            {activeEmployees.sort(sortByEmpId).map(e=><option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>)}
          </select>
          <div className="flex items-center gap-2">
            <button onClick={()=>setCalendarMonth(m=>new Date(m.getFullYear(),m.getMonth()-1))} className={`p-2 rounded-lg ${darkMode?"hover:bg-[#2a2a2a]":"hover:bg-gray-100"}`}><ChevronLeft size={18}/></button>
            <span className={`font-semibold w-40 text-center ${txt}`}>{format(calendarMonth,"MMMM yyyy")}</span>
            <button onClick={()=>setCalendarMonth(m=>new Date(m.getFullYear(),m.getMonth()+1))} className={`p-2 rounded-lg ${darkMode?"hover:bg-[#2a2a2a]":"hover:bg-gray-100"}`}><ChevronRight size={18}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">{DAYS_SHORT.map(d=><div key={d} className={`text-center text-xs font-semibold py-1 ${txtMuted}`}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({length:first}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:days}).map((_,i)=>{
            const day=i+1;
            const ds=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const status=getCellStatus(day); const cur=isToday(parseISO(ds));
            return (
              <div key={day} onClick={()=>{setSelectedDate(ds);setAttendanceView("daily");}}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 text-xs font-bold
                  ${cur?"ring-2 ring-red-600":""}
                  ${status?STATUS_STYLES[status]:darkMode?"bg-[#1a1a1a] text-gray-400 hover:bg-[#222]":"bg-gray-50 text-gray-400 hover:bg-gray-100"}`}>
                {day}
                {status&&<div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${STATUS_DOT[status]}`}/>}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
          {Object.entries(STATUS_DOT).map(([s,dot])=>(
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${dot}`}/>
              <span className={`text-xs ${txtMuted}`}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Org chart ───────────────────────────────────────────────────────────────
  const OrgNode=({emp,depth}:{emp:Employee;depth:number})=>{
    const lvl = ORG_LEVEL_STYLES[Math.min(depth, ORG_LEVEL_STYLES.length-1)];
    const reports = activeEmployees.filter(e=>e.reportsTo===emp.id).sort(sortByEmpId);
    return (
      <div className="flex flex-col items-center">
        <div className={`rounded-xl border-2 p-3 w-44 text-center shadow-sm ${lvl.ring} ${darkMode?"bg-[#1a1a1a]":"bg-white"}`}>
          <div className={`w-9 h-9 rounded-full mx-auto mb-1.5 flex items-center justify-center text-xs font-bold text-white ${lvl.bg}`}>
            {emp.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
          </div>
          {depth===0&&<div className={`text-xs font-bold uppercase tracking-widest mb-0.5 ${lvl.bg.replace("bg-","text-")}`}>{lvl.label}</div>}
          {emp.isCsuite&&<Star size={10} className="mx-auto mb-0.5 text-red-500 fill-red-500"/>}
          <div className={`text-xs font-semibold leading-tight ${txt}`}>{emp.name}</div>
          <div className={`text-xs mt-0.5 ${txtMuted}`}>{emp.designation||emp.department}</div>
          <div className={`text-xs mt-0.5 ${txtSub}`}>{emp.employeeId}</div>
          <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block font-medium ${lvl.bg} text-white`}>{lvl.label.split(" ")[0]}</div>
        </div>
        {reports.length>0&&(
          <div className="flex flex-col items-center">
            <div className={`w-px h-6 ${darkMode?"bg-[#2a2a2a]":"bg-gray-300"}`}/>
            <div className="flex gap-4 items-start">
              {reports.map(r=>(
                <div key={r.id} className="flex flex-col items-center">
                  <div className={`w-px h-5 ${darkMode?"bg-[#2a2a2a]":"bg-gray-300"}`}/>
                  <OrgNode emp={r} depth={depth+1}/>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const OrganogramView=()=>{
    const roots=activeEmployees.filter(e=>!e.reportsTo||!activeEmployees.find(x=>x.id===e.reportsTo)).sort(sortByEmpId);
    return (
      <div className={`${cardCls} p-6 overflow-auto`}>
        <h3 className={`text-base font-semibold mb-2 flex items-center gap-2 ${txt}`}><GitBranch size={16} className="text-red-600"/> Organisation Chart</h3>
        {/* Level legend */}
        <div className="flex flex-wrap gap-3 mb-6">
          {ORG_LEVEL_STYLES.map((lvl,i)=>(
            <div key={i} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${lvl.bg}`}/>
              <span className={`text-xs ${txtMuted}`}>{lvl.label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-8 items-start justify-center flex-wrap min-w-max mx-auto pb-4">
          {roots.map(e=><OrgNode key={e.id} emp={e} depth={0}/>)}
        </div>
        <p className={`text-xs mt-4 text-center ${txtSub}`}>Set "Reports To" in each employee profile to build the hierarchy. Only active employees shown.</p>
      </div>
    );
  };

  // ─── Employee tile ────────────────────────────────────────────────────────────
  const EmpTile=({emp,isFormer=false}:{emp:Employee;isFormer?:boolean})=>(
    <div className={`${cardCls} p-4 flex flex-col items-center text-center gap-2 transition-all hover:shadow-md hover:border-red-300 ${isFormer?"opacity-60":""}`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 relative ${isFormer?"bg-gray-400":emp.isCsuite?"bg-red-600":"bg-black"}`}>
        {emp.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
        {emp.isCsuite&&<Star size={10} className="absolute -top-0.5 -right-0.5 text-red-400 fill-red-400"/>}
      </div>
      <div className="min-w-0 w-full">
        <div className={`text-xs font-semibold leading-tight truncate ${txt}`}>{emp.name}</div>
        <div className={`text-xs truncate mt-0.5 ${txtMuted}`}>{emp.designation||"—"}</div>
        <div className={`text-xs mt-1 ${txtSub}`}>{emp.employeeId}</div>
        {emp.isCsuite&&<div className="mt-1"><span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">C-Suite</span></div>}
        {isFormer&&emp.cessationDate&&<div className={`text-xs mt-1 ${txtSub}`}>Left: {fmtDate(emp.cessationDate)}</div>}
        {!isFormer&&emp.positionType==="contractual"&&emp.cessationDate&&(
          <div className={`text-xs mt-1 font-medium ${differenceInDays(parseISO(emp.cessationDate),today)<=45?"text-red-600":"text-gray-500"}`}>
            Contract ends: {fmtDate(emp.cessationDate)}
          </div>
        )}
      </div>
      <div className="flex gap-1 mt-1">
        <button onClick={()=>openEditEmp(emp)} className={`p-1 rounded-lg ${darkMode?"hover:bg-[#2a2a2a] text-gray-400":"hover:bg-gray-100 text-gray-500"}`}><Edit2 size={12}/></button>
        <button onClick={()=>removeEmployee(emp.id)} className="p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-600 transition-all"><Trash2 size={12}/></button>
      </div>
    </div>
  );

  if (!isHydrated) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <p className="text-gray-400 text-sm">Loading ANTS Drone Hub…</p>
    </div>
  );

  const holidayToday = getHoliday(selectedDate);
  const summaryMonthLabel = summaryMonth ? `${MONTHS[parseInt(summaryMonth.slice(5,7))-1]} ${summaryMonth.slice(0,4)}` : "";
  const allAlerts = [
    ...upcomingBirthdays.map(e  => ({ kind: "birthday"  as const, ...e })),
    ...upcomingHolidays.map(h   => ({ kind: "holiday"   as const, ...h })),
    ...cessationAlerts.map(e    => ({ kind: "cessation" as const, ...e })),
  ];

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg} ${txt}`}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className={`sticky top-0 z-40 border-b ${darkMode?"bg-[#0a0a0a]/95 border-[#2a2a2a]":"bg-white/95 border-gray-200"} backdrop-blur-sm`}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center shadow">
              <Users size={18} className="text-white"/>
            </div>
            <div>
              <h1 className="text-base font-bold leading-none tracking-tight">ANTS Drone Hub</h1>
              <p className={`text-xs ${txtMuted}`}>HR Dashboard · Attendance & Leave Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex rounded-lg p-1 gap-1 ${darkMode?"bg-[#141414] border border-[#2a2a2a]":"bg-gray-100"}`}>
              {([["employees","Employees",Users],["attendance","Attendance",Clock]] as const).map(([tab,label,Icon])=>(
                <button key={tab} onClick={()=>setMainTab(tab)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all
                    ${mainTab===tab?"bg-red-600 text-white shadow-sm":darkMode?"text-gray-400 hover:text-white":"text-gray-600 hover:text-black"}`}>
                  <Icon size={13}/>{label}
                </button>
              ))}
            </div>
            {/* Office time setting */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${darkMode?"border-[#2a2a2a] text-gray-300":"border-gray-200 text-gray-600"}`}>
              <Clock size={12} className="text-red-500"/>
              <span className={txtMuted}>Office:</span>
              <input type="time" value={officeTime} onChange={e=>setOfficeTime(e.target.value)}
                className={`bg-transparent outline-none text-xs font-semibold ${txt} w-16`}/>
              <span className={txtSub}>Late: {lateTime}</span>
            </div>
            <button onClick={()=>setDarkMode(d=>!d)} className={`p-2 rounded-lg border transition-all ${darkMode?"border-[#2a2a2a] text-yellow-400 hover:border-yellow-600":"border-gray-200 text-gray-500 hover:border-gray-400"}`}>
              {darkMode?<Sun size={16}/>:<Moon size={16}/>}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Stats bar ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 lg:grid-cols-7 gap-3">
          {([
            ["Total",    todayStats.total,   "border-l-black"],
            ["Present",  todayStats.present, "border-l-red-600"],
            ["Early",    todayStats.early,   "border-l-gray-700"],
            ["Late",     todayStats.late,    "border-l-red-400"],
            ["WFH",      todayStats.wfh,     "border-l-gray-400"],
            ["On Leave", todayStats.onLeave, "border-l-red-300"],
            ["Absent",   todayStats.absent,  "border-l-gray-300"],
          ] as [string, number, string][]).map(([label, value, accent])=>(
            <div key={label} className={`${cardCls} p-3 flex items-center gap-2 border-l-4 ${accent}`}>
              <div>
                <div className={`text-xl font-bold ${txt}`}>{value}</div>
                <div className={`text-xs ${txtMuted}`}>{label}</div>
              </div>
            </div>
          ))}
        </div>
        <p className={`text-xs -mt-4 ${txtSub}`}>Today's summary — {fmtDate(todayStr)} · Office: {officeTime} · Late after: {lateTime}</p>

        {/* ══════════ EMPLOYEES TAB ══════════════════════════════════════════ */}
        {mainTab==="employees"&&(
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className={`text-lg font-bold flex items-center gap-2 ${txt}`}>
                  <Users size={18} className="text-red-600"/> Employee Profiles
                  <span className={`text-xs font-normal px-2 py-0.5 rounded-full border ${darkMode?"border-[#2a2a2a] text-gray-400":"border-gray-200 text-gray-500"}`}>{activeEmployees.length} active · {formerEmployees.length} former</span>
                </h2>
                {/* Current / Former toggle */}
                <div className={`flex rounded-lg p-1 gap-1 ${darkMode?"bg-[#141414] border border-[#2a2a2a]":"bg-gray-100"}`}>
                  {([["current","Current",UserCheck],["former","Former",History]] as const).map(([v,label,Icon])=>(
                    <button key={v} onClick={()=>setEmpSubView(v)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all
                        ${empSubView===v?"bg-red-600 text-white":darkMode?"text-gray-400 hover:text-white":"text-gray-600 hover:text-black"}`}>
                      <Icon size={13}/>{label}
                    </button>
                  ))}
                </div>
                {/* Cards / Org toggle — only for current */}
                {empSubView==="current"&&(
                  <div className={`flex rounded-lg p-1 gap-1 ${darkMode?"bg-[#141414] border border-[#2a2a2a]":"bg-gray-100"}`}>
                    {([["tiles","Tiles",LayoutGrid],["organogram","Org Chart",GitBranch]] as const).map(([v,label,Icon])=>(
                      <button key={v} onClick={()=>setEmpView(v)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all
                          ${empView===v?"bg-red-600 text-white":darkMode?"text-gray-400 hover:text-white":"text-gray-600 hover:text-black"}`}>
                        <Icon size={13}/>{label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input ref={empCsvRef} type="file" accept=".csv" className="hidden" onChange={handleEmpCSV}/>
                <button onClick={dlEmpTpl} className={btnGhost}><Download size={13}/> Template</button>
                <button onClick={()=>empCsvRef.current?.click()} className={btnGhost}><Upload size={13}/> Import CSV</button>
                <button onClick={exportEmployeesCSV} className={btnGhost}><Download size={13}/> Export CSV</button>
                <button onClick={openAddEmp} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all">
                  <Plus size={14}/> Add Employee
                </button>
              </div>
            </div>

            {/* Current employees */}
            {empSubView==="current"&&(
              empView==="organogram"?<OrganogramView/>:(
                <div className="space-y-8">
                  {Object.entries(groupByDept(activeEmployees)).sort(([a],[b])=>a.localeCompare(b)).map(([dept,emps])=>(
                    <div key={dept}>
                      <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${border}`}>
                        <div className="w-1 h-4 rounded-full bg-red-600"/>
                        <h3 className={`text-sm font-bold ${txt}`}>{dept}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${darkMode?"border-[#2a2a2a] text-gray-400":"border-gray-200 text-gray-500"}`}>{emps.length}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {emps.map(emp=><EmpTile key={emp.id} emp={emp}/>)}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Former employees */}
            {empSubView==="former"&&(
              <div className="space-y-8">
                {formerEmployees.length===0?(
                  <div className={`${cardCls} p-12 text-center`}>
                    <History size={32} className={`mx-auto mb-3 ${txtSub}`}/>
                    <p className={`text-sm ${txtMuted}`}>No former employees yet.</p>
                    <p className={`text-xs mt-1 ${txtSub}`}>Employees with a cessation date in the past will appear here.</p>
                  </div>
                ):(
                  Object.entries(groupByDept(formerEmployees)).sort(([a],[b])=>a.localeCompare(b)).map(([dept,emps])=>(
                    <div key={dept}>
                      <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${border}`}>
                        <div className="w-1 h-4 rounded-full bg-gray-400"/>
                        <h3 className={`text-sm font-bold ${txtMuted}`}>{dept}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${darkMode?"border-[#2a2a2a] text-gray-500":"border-gray-200 text-gray-400"}`}>{emps.length}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {emps.map(emp=><EmpTile key={emp.id} emp={emp} isFormer/>)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════ ATTENDANCE TAB ═════════════════════════════════════════ */}
        {mainTab==="attendance"&&(
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className={`flex rounded-lg p-1 gap-1 ${darkMode?"bg-[#141414] border border-[#2a2a2a]":"bg-gray-100"}`}>
                {([["daily","Daily",Clock],["calendar","Calendar",CalendarDays],["summary","Summary",BarChart3]] as const).map(([mode,label,Icon])=>(
                  <button key={mode} onClick={()=>setAttendanceView(mode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                      ${attendanceView===mode?"bg-red-600 text-white":darkMode?"text-gray-400 hover:text-white":"text-gray-600 hover:text-black"}`}>
                    <Icon size={13}/>{label}
                  </button>
                ))}
              </div>
              <button onClick={exportAttendanceCSV} className={btnGhost}><Download size={13}/> Export CSV</button>
            </div>

            {attendanceView==="calendar"&&<CalendarView/>}

            {/* Summary */}
            {attendanceView==="summary"&&(
              <div className={`${cardCls} p-6`}>
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                  <h2 className={`text-lg font-semibold flex items-center gap-2 ${txt}`}><TrendingUp size={18} className="text-red-600"/> Monthly Summary</h2>
                  <div className="flex items-center gap-2">
                    <label className={`text-xs font-medium ${txtMuted}`}>Month:</label>
                    <select value={summaryMonth} onChange={e=>setSummaryMonth(e.target.value)}
                      className={`rounded-lg px-3 py-1.5 text-sm border outline-none focus:ring-2 focus:ring-red-500 ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-white":"border-gray-200"}`}>
                      {availableMonths.map(m=>{
                        const [y,mo]=m.split("-");
                        return <option key={m} value={m}>{MONTHS[parseInt(mo)-1]} {y}</option>;
                      })}
                    </select>
                  </div>
                </div>
                <p className={`text-xs mb-4 ${txtMuted}`}>Showing: <strong>{summaryMonthLabel}</strong> · Leave balances show yearly totals.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`border-b text-xs uppercase ${darkMode?"border-[#2a2a2a] text-gray-500":"border-gray-100 text-gray-400"}`}>
                        <th className="py-3 text-left">Employee</th>
                        <th className="py-3 text-left">Designation</th>
                        <th className="py-3 text-left">Type</th>
                        <th className="py-3 text-center">Early</th>
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
                        <tr key={`dept-${dept}`}>
                          <td colSpan={11} className={`py-2 text-xs font-bold uppercase tracking-wider ${darkMode?"text-gray-500":"text-gray-400"}`}>
                            <span className="inline-flex items-center gap-1.5"><span className="w-1 h-3 rounded-full bg-red-600 inline-block"/>{dept}</span>
                          </td>
                        </tr>,
                        ...emps.map(emp=>{
                          const s=getMonthlySummary(emp.id,summaryMonth);
                          const lsUsed=getLateStartCount(emp.id,summaryMonth);
                          return (
                            <tr key={emp.id} className={`border-b last:border-0 ${darkMode?"border-[#1a1a1a]":"border-gray-50"}`}>
                              <td className="py-3 font-medium">
                                <div className="flex items-center gap-1.5">
                                  {emp.isCsuite&&<Star size={11} className="text-red-500 fill-red-500 shrink-0"/>}
                                  <div>
                                    <div className={txt}>{emp.name}</div>
                                    <div className={`text-xs ${txtSub}`}>{emp.employeeId}</div>
                                  </div>
                                </div>
                              </td>
                              <td className={`py-3 text-xs ${txtMuted}`}>{emp.designation}</td>
                              <td className="py-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${emp.employmentType==="part-time"?"border-red-300 text-red-700 bg-red-50":"border-gray-300 text-gray-700 bg-gray-50"}`}>
                                  {emp.employmentType==="part-time"?"PT":"FT"}
                                </span>
                              </td>
                              <td className={`py-3 text-center font-semibold ${darkMode?"text-gray-300":"text-gray-700"}`}>{s.early}</td>
                              <td className={`py-3 text-center font-semibold ${txt}`}>{s.onTime}</td>
                              <td className="py-3 text-center font-semibold text-red-600">{s.late}</td>
                              <td className="py-3 text-center">
                                <span className={`font-semibold ${lsUsed>=emp.lateStartLimit?"text-red-600":darkMode?"text-gray-300":"text-gray-700"}`}>{s.lateStart}</span>
                                <span className={`text-xs ml-1 ${txtSub}`}>({lsUsed}/{emp.lateStartLimit})</span>
                              </td>
                              <td className={`py-3 text-center font-semibold ${txtMuted}`}>{s.wfh}</td>
                              <td className="py-3 text-center font-semibold text-red-400">{s.leave}</td>
                              <td className={`py-3 text-center font-semibold ${txtSub}`}>{s.absent}</td>
                              <td className="py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold border ${emp.remainingLeaves<=3?"bg-red-600 text-white border-red-600":darkMode?"border-[#2a2a2a] text-gray-300":"border-gray-200 text-gray-700"}`}>
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
                <div className={`${cardCls} xl:col-span-3 p-6`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className={`text-base font-semibold flex items-center gap-2 ${txt}`}><Clock size={16} className="text-red-600"/> Daily Entry</h2>
                      <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
                        className={`rounded-lg px-2 py-1 text-sm border ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-white":"border-gray-200"}`}/>
                      <span className={`text-xs font-medium ${txtMuted}`}>{fmtDate(selectedDate)}</span>
                      {holidayToday&&(
                        <span className={`px-2 py-1 rounded-full text-xs font-bold border ${darkMode?"border-[#2a2a2a] text-gray-300":"border-gray-300 text-gray-700"}`}>
                          🎉 {holidayToday.name}{holidayToday.considerAttendance?" (tracked)":""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 mb-4">
                    <div className={`flex items-center gap-2 flex-1 rounded-lg px-3 py-2 border ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a]":"border-gray-200"}`}>
                      <Search size={14} className={txtMuted}/>
                      <input placeholder="Search name or ID…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className={`bg-transparent outline-none w-full text-sm ${txt}`}/>
                    </div>
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-white":"border-gray-200"}`}>
                      <Filter size={14} className={txtMuted}/>
                      <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} className={`bg-transparent outline-none text-sm ${txt}`}>
                        {departments.map(d=><option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`border-b text-xs uppercase tracking-wide ${darkMode?"border-[#2a2a2a] text-gray-500":"border-gray-100 text-gray-400"}`}>
                          <th className="py-3 text-left">Employee</th>
                          <th className="py-3 text-left">Role / Dept</th>
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
                              <div className={`flex items-center gap-2 py-2 mt-2 text-xs font-bold uppercase tracking-wider ${txtSub}`}>
                                <span className="w-1 h-3 rounded-full bg-red-600 inline-block"/>{dept}
                              </div>
                            </td>
                          </tr>,
                          ...emps.map(emp=>{
                            const dayRecord=records.find(r=>r.date===selectedDate&&r.employeeId===emp.id);
                            const isPartTime=emp.employmentType==="part-time";
                            const showClear=isPartTime||emp.isCsuite;
                            const monthStr=selectedDate.slice(0,7);
                            const lsUsed=getLateStartCount(emp.id,monthStr);
                            const lsAtLimit=lsUsed>=emp.lateStartLimit;
                            return (
                              <tr key={emp.id} className={`border-b last:border-0 ${darkMode?"border-[#1a1a1a]":"border-gray-50"}`}>
                                <td className="py-3">
                                  <div className={`font-medium text-sm flex items-center gap-1 ${txt}`}>
                                    {emp.isCsuite&&<Star size={11} className="text-red-500 fill-red-500 shrink-0"/>}
                                    {emp.name}
                                  </div>
                                  <div className={`text-xs flex items-center gap-1 ${txtSub}`}>
                                    {emp.employeeId}
                                    {isPartTime&&<span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-xs">PT</span>}
                                  </div>
                                </td>
                                <td className="py-3">
                                  <div className={`text-xs font-medium ${txt}`}>{emp.designation||"—"}</div>
                                  <div className={`text-xs ${txtSub}`}>{emp.department||"—"}</div>
                                </td>
                                <td className="py-3 text-center">
                                  <input type="time" value={dayRecord?.inTime||""}
                                    onChange={e=>{if(e.target.value) handleAttendanceEntry(emp.id,e.target.value);}}
                                    className={`rounded-lg px-2 py-1 text-xs border w-28 ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-white":"border-gray-200"}`}/>
                                </td>
                                <td className="py-3">
                                  <div className="flex items-center justify-center gap-1 flex-wrap">
                                    <button onClick={()=>handleAttendanceEntry(emp.id,"00:00","WFH")} title="WFH" className={`p-1.5 rounded-lg hover:scale-110 transition-all ${darkMode?"hover:bg-[#2a2a2a] text-gray-400":"hover:bg-gray-100 text-gray-600"}`}><Home size={15}/></button>
                                    <button onClick={()=>handleAttendanceEntry(emp.id,"00:00","Leave")} title="Leave" className="p-1.5 rounded-lg hover:scale-110 transition-all hover:bg-red-50 text-red-400 hover:text-red-600"><UserX size={15}/></button>
                                    <button onClick={()=>handleAttendanceEntry(emp.id,"00:00","Absent")} title="Absent" className={`p-1.5 rounded-lg hover:scale-110 transition-all ${darkMode?"hover:bg-[#2a2a2a] text-gray-500":"hover:bg-gray-100 text-gray-400"}`}><XCircle size={15}/></button>
                                    <button onClick={()=>openLateStartModal(emp.id)} title={lsAtLimit?`⚠ Limit (${lsUsed}/${emp.lateStartLimit})`:"Late Start"}
                                      className={`p-1.5 rounded-lg hover:scale-110 transition-all relative ${lsAtLimit?"text-red-500 hover:bg-red-50":"hover:bg-red-50 text-red-400"}`}>
                                      <Coffee size={15}/>
                                      {lsAtLimit&&<span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-600"/>}
                                    </button>
                                    {showClear&&(
                                      <button onClick={()=>clearEntry(emp.id)} title="Clear entry" className={`p-1.5 rounded-lg hover:scale-110 transition-all ${darkMode?"hover:bg-[#2a2a2a] text-gray-500":"hover:bg-gray-100 text-gray-400"}`}><Ban size={15}/></button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button title={dayRecord?.note||"Add note"}
                                      onClick={()=>{setNoteModal({empId:emp.id,field:"note"});setNoteValue(dayRecord?.note||"");}}
                                      className={`p-1.5 rounded-lg ${dayRecord?.note?"text-red-500":darkMode?"text-gray-600 hover:text-gray-400":"text-gray-300 hover:text-gray-500"}`}><StickyNote size={15}/></button>
                                    {(dayRecord?.status==="Late"||dayRecord?.status==="Late Start Request")&&(
                                      <button title={dayRecord?.lateReason||"Add reason"}
                                        onClick={()=>{setNoteModal({empId:emp.id,field:"lateReason"});setNoteValue(dayRecord?.lateReason||"");}}
                                        className={`p-1.5 rounded-lg ${dayRecord?.lateReason?"text-red-500":darkMode?"text-gray-600 hover:text-gray-400":"text-gray-300 hover:text-gray-500"}`}><AlertTriangle size={15}/></button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${dayRecord?STATUS_STYLES[dayRecord.status]:darkMode?"bg-[#1a1a1a] text-gray-500":"bg-gray-100 text-gray-400"}`}>
                                    {dayRecord?.status||"No Entry"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ])}
                        {filteredAttendanceEmps.length===0&&(
                          <tr><td colSpan={6} className={`text-center py-10 text-sm ${txtMuted}`}>No active employees match your search.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Side Panel */}
                <div className="space-y-4">
                  {/* All alerts */}
                  {allAlerts.length>0&&(
                    <div className={`${cardCls} p-5`}>
                      <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${txt}`}>
                        <Bell size={14} className="text-red-500"/> Alerts
                        <span className="w-4 h-4 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">{allAlerts.length}</span>
                      </h3>
                      <div className="space-y-2">
                        {upcomingBirthdays.map(emp=>(
                          <div key={`b-${emp.id}`} className={`flex items-center gap-2 p-2 rounded-lg border ${darkMode?"border-[#2a2a2a] bg-[#1a1a1a]":"border-red-100 bg-red-50"}`}>
                            <Cake size={14} className="text-red-500 shrink-0"/>
                            <div>
                              <div className={`text-xs font-medium ${txt}`}>{emp.name}</div>
                              <div className="text-xs text-red-500">{emp.daysUntil===0?"🎂 Today!":`Birthday in ${emp.daysUntil}d`}</div>
                            </div>
                          </div>
                        ))}
                        {upcomingHolidays.map(h=>(
                          <div key={`h-${h.date}`} className={`flex items-center gap-2 p-2 rounded-lg border ${darkMode?"border-[#2a2a2a] bg-[#1a1a1a]":"border-gray-200 bg-gray-50"}`}>
                            <CalendarOff size={14} className={`${txtMuted} shrink-0`}/>
                            <div>
                              <div className={`text-xs font-medium ${txt}`}>{h.name}</div>
                              <div className={`text-xs ${txtMuted}`}>{h.daysUntil===0?"Today":`In ${h.daysUntil}d`} · {h.type==="company"?"Company":"Public"}</div>
                            </div>
                          </div>
                        ))}
                        {cessationAlerts.map(emp=>(
                          <div key={`c-${emp.id}`} className={`flex items-center gap-2 p-2 rounded-lg border ${darkMode?"border-red-900 bg-red-900/20":"border-red-200 bg-red-50"}`}>
                            <AlertTriangle size={14} className="text-red-600 shrink-0"/>
                            <div>
                              <div className={`text-xs font-bold text-red-600`}>{emp.name}</div>
                              <div className="text-xs text-red-500">
                                {emp.positionType==="contractual"?"Contract":"Employment"} ends {fmtDate(emp.cessationDate)}
                                {emp.daysUntil===0?" — Today!":`(${emp.daysUntil}d left)`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Leave balances */}
                  <div className={`${cardCls} p-5`}>
                    <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${txt}`}><BarChart3 size={14} className="text-red-600"/> Leave Balances</h3>
                    <div className="space-y-4">
                      {activeEmployees.sort(sortByEmpId).map(emp=>{
                        const pct=(emp.remainingLeaves/emp.totalLeaves)*100;
                        return (
                          <div key={emp.id}>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className={`font-medium truncate max-w-[130px] ${txt}`}>{emp.name}</span>
                              <span className={`font-bold ${emp.remainingLeaves<=3?"text-red-600":txtMuted}`}>{emp.remainingLeaves}/{emp.totalLeaves}</span>
                            </div>
                            <div className={`h-1.5 rounded-full ${darkMode?"bg-[#2a2a2a]":"bg-gray-100"}`}>
                              <div className={`h-1.5 rounded-full transition-all duration-500 ${pct>50?"bg-black":pct>20?"bg-gray-500":"bg-red-600"}`} style={{width:`${pct}%`}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Holidays */}
                  <div className={`${cardCls} p-5`}>
                    <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${txt}`}><CalendarOff size={14} className="text-red-600"/> Holidays</h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button onClick={()=>setShowHolidayForm(true)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white"><Plus size={11}/> Add</button>
                      <input ref={holidayCsvRef} type="file" accept=".csv" className="hidden" onChange={handleHolidayCSV}/>
                      <button onClick={dlHolTpl} className={btnGhost}><Download size={11}/> Template</button>
                      <button onClick={()=>holidayCsvRef.current?.click()} className={btnGhost}><Upload size={11}/> Import</button>
                    </div>
                    {holidays.length===0&&<p className={`text-xs ${txtSub}`}>No holidays added yet.</p>}
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {holidays.sort((a,b)=>a.date.localeCompare(b.date)).map(h=>(
                        <div key={h.date} className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-medium ${txt}`}>{h.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full border ${darkMode?"border-[#2a2a2a] text-gray-400":"border-gray-200 text-gray-500"}`}>{h.type==="company"?"Co.":"Pub."}</span>
                            </div>
                            <div className={`text-xs ${txtSub}`}>{fmtDate(h.date)}{h.considerAttendance?" · tracked":""}</div>
                          </div>
                          <button onClick={()=>removeHoliday(h.date)} className={`${darkMode?"text-gray-600 hover:text-red-400":"text-gray-300 hover:text-red-500"} transition-colors`}><Trash2 size={12}/></button>
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

      {/* ── Late Start Modal ─────────────────────────────────────────────────── */}
      {lateStartModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardCls} w-full max-w-xs p-6 shadow-2xl`}>
            <h3 className={`text-base font-bold mb-1 ${txt}`}>Late Start Request</h3>
            <p className={`text-xs mb-4 ${txtMuted}`}>{employees.find(e=>e.id===lateStartModal.empId)?.name} · {fmtDate(selectedDate)}</p>
            {(()=>{ const emp=employees.find(e=>e.id===lateStartModal.empId); const used=emp?getLateStartCount(emp.id,selectedDate.slice(0,7)):0; const limit=emp?.lateStartLimit??2;
              return used>=limit?(<div className="flex items-center gap-2 p-2 rounded-lg mb-4 bg-red-50 border border-red-200"><AlertTriangle size={14} className="text-red-500 shrink-0"/><p className="text-xs text-red-700">Limit reached: {used}/{limit} this month. Can still proceed.</p></div>):null;
            })()}
            <label className={labelCls}>Entry Time</label>
            <input type="time" value={lateStartTime} onChange={e=>setLateStartTime(e.target.value)} autoFocus className={`${inputCls} mb-4`}/>
            <div className="flex gap-2">
              <button onClick={()=>setLateStartModal(null)} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${border} ${darkMode?"hover:bg-[#1a1a1a]":"hover:bg-gray-50"}`}>Cancel</button>
              <button onClick={confirmLateStart} className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Late Start Limit Warning ─────────────────────────────────────────── */}
      {lateStartWarning&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardCls} w-full max-w-sm p-6 shadow-2xl`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600"/></div>
              <h3 className={`text-base font-bold ${txt}`}>Late Start Limit Exceeded</h3>
            </div>
            <p className={`text-sm mb-5 ${txtMuted}`}><strong>{lateStartWarning.empName}</strong> has used <strong>{lateStartWarning.used}</strong> of <strong>{lateStartWarning.limit}</strong> late starts this month. Entry will be recorded.</p>
            <button onClick={()=>{ if(pendingEntry) commitEntry(pendingEntry.empId,pendingEntry.inTime,pendingEntry.status); setPendingEntry(null); setLateStartWarning(null); }}
              className="w-full py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white">OK, Understood</button>
          </div>
        </div>
      )}

      {/* ── Holiday Override ─────────────────────────────────────────────────── */}
      {holidayWarning&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardCls} w-full max-w-sm p-6 shadow-2xl`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><AlertTriangle size={20} className="text-red-600"/></div>
              <h3 className={`text-base font-bold ${txt}`}>Holiday Override</h3>
            </div>
            <p className={`text-sm mb-5 ${txtMuted}`}><strong>{fmtDate(selectedDate)}</strong> is a holiday (<strong>{getHoliday(selectedDate)?.name}</strong>). Attendance tracking is off. Won't deduct leave. Proceed?</p>
            <div className="flex gap-3">
              <button onClick={()=>{setHolidayWarning(false);setPendingEntry(null);}} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${border} ${darkMode?"hover:bg-[#1a1a1a]":"hover:bg-gray-50"}`}>Cancel</button>
              <button onClick={confirmHolidayOverride} className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white">Mark Anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Employee Form ────────────────────────────────────────────────────── */}
      {showEmpForm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardCls} w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl`}>
            <div className={`sticky top-0 flex items-center justify-between p-6 pb-4 border-b ${border} ${surface}`}>
              <h3 className={`text-base font-bold ${txt}`}>{editingEmp?"Edit Employee":"Add New Employee"}</h3>
              <button onClick={()=>setShowEmpForm(false)} className={`p-1.5 rounded-lg ${darkMode?"hover:bg-[#2a2a2a]":"hover:bg-gray-100"}`}><X size={16}/></button>
            </div>
            <div className="p-6 space-y-5">
              <div>{sectionTitle("Identity")}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {fi("Employee ID *","employeeId")} {fi("Full Name *","name")}
                  {fi("Designation","designation")} {fi("Department","department")}
                  <div><label className={labelCls}>Reports To</label>
                    <select value={empForm.reportsTo} onChange={e=>setEmpForm(f=>({...f,reportsTo:e.target.value}))} className={inputCls}>
                      <option value="">None</option>
                      {employees.filter(e=>!editingEmp||e.id!==editingEmp.id).sort(sortByEmpId).map(e=><option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>)}
                    </select>
                  </div>
                  {fi("Blood Group","bloodGroup","text",BLOOD_GROUPS)}
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={empForm.isCsuite} onChange={e=>setEmpForm(f=>({...f,isCsuite:e.target.checked}))} className="w-4 h-4 accent-red-600"/>
                      <div>
                        <div className={`text-sm font-medium ${txt}`}>C-Suite Executive</div>
                        <div className={`text-xs ${txtMuted}`}>Enables "Clear Entry" button in attendance. Shown with ★ badge.</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              <div>{sectionTitle("Employment")}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={labelCls}>Employment Type</label>
                    <select value={empForm.employmentType} onChange={e=>setEmpForm(f=>({...f,employmentType:e.target.value as EmploymentType}))} className={inputCls}>
                      <option value="full-time">Full-time</option><option value="part-time">Part-time</option>
                    </select></div>
                  <div><label className={labelCls}>Position Type</label>
                    <select value={empForm.positionType} onChange={e=>setEmpForm(f=>({...f,positionType:e.target.value as PositionType}))} className={inputCls}>
                      <option value="permanent">Permanent</option><option value="contractual">Contractual</option>
                    </select></div>
                  {fi("Joining Date","joiningDate","date")}
                  <div>
                    <label className={labelCls}>
                      Cessation Date
                      {empForm.positionType==="contractual"&&<span className="ml-1 text-red-500">* required for contractual</span>}
                    </label>
                    <input type="date" value={empForm.cessationDate} onChange={e=>setEmpForm(f=>({...f,cessationDate:e.target.value}))} className={inputCls}/>
                    {empForm.positionType==="contractual"&&<p className={`text-xs mt-1 ${txtSub}`}>Alert will appear 45 days before this date.</p>}
                  </div>
                  <div><label className={labelCls}>Total Leaves / Year</label>
                    <input type="number" value={empForm.totalLeaves} onChange={e=>setEmpForm(f=>({...f,totalLeaves:Number(e.target.value),remainingLeaves:Number(e.target.value)}))} className={inputCls}/></div>
                  <div><label className={labelCls}>Late Start Limit / Month</label>
                    <input type="number" min={0} value={empForm.lateStartLimit} onChange={e=>setEmpForm(f=>({...f,lateStartLimit:Number(e.target.value)}))} className={inputCls}/></div>
                </div>
                {empForm.employmentType==="part-time"&&(
                  <div className={`mt-4 p-4 rounded-xl border ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a]":"bg-red-50 border-red-200"}`}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-3 text-red-600">Part-time Schedule</p>
                    <div className="mb-3">
                      <label className={labelCls}>Working Days</label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day,idx)=>{ const checked=empForm.workingDays.includes(idx); return (
                          <button key={day} type="button" onClick={()=>setEmpForm(f=>({...f,workingDays:checked?f.workingDays.filter(d=>d!==idx):[...f.workingDays,idx].sort()}))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${checked?"bg-red-600 border-red-600 text-white":darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-gray-300":"bg-white border-gray-200 text-gray-600 hover:border-red-400"}`}>
                            {DAYS_SHORT[idx]}
                          </button>); })}
                      </div>
                      <p className={`text-xs mt-1 ${txtSub}`}>{empForm.workingDays.length} day{empForm.workingDays.length!==1?"s":""} selected</p>
                    </div>
                    <div><label className={labelCls}>Working Hours (free text)</label>
                      <input type="text" value={empForm.workingHours} onChange={e=>setEmpForm(f=>({...f,workingHours:e.target.value}))} placeholder="e.g. 10:00–14:00 or 4 hours/day" className={inputCls}/></div>
                  </div>
                )}
              </div>
              <div>{sectionTitle("Contact")}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {phoneField("Phone Number","phoneCode","phone")}
                  {phoneField("Emergency Contact","emergencyCode","emergencyContact")}
                  {fi("Personal Email","email","email")} {fi("Company Email","companyEmail","email")}
                  <div className="sm:col-span-2">{fi("Present Address","presentAddress")}</div>
                </div>
              </div>
              <div>{sectionTitle("Personal")}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{fi("Birthday","birthday","date")}</div>
              </div>
            </div>
            <div className={`sticky bottom-0 flex gap-3 p-6 pt-4 border-t ${border} ${surface}`}>
              <button onClick={()=>setShowEmpForm(false)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${border} ${darkMode?"hover:bg-[#1a1a1a]":"hover:bg-gray-50"}`}>Cancel</button>
              <button onClick={saveEmployee} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2">
                <Save size={14}/>{editingEmp?"Save Changes":"Add Employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Holiday Form ─────────────────────────────────────────────────────── */}
      {showHolidayForm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardCls} w-full max-w-sm shadow-2xl`}>
            <div className="flex items-center justify-between p-6 pb-4">
              <h3 className={`text-base font-bold ${txt}`}>Add Holiday</h3>
              <button onClick={()=>setShowHolidayForm(false)} className={`p-1.5 rounded-lg ${darkMode?"hover:bg-[#2a2a2a]":"hover:bg-gray-100"}`}><X size={16}/></button>
            </div>
            <div className="px-6 pb-4 space-y-3">
              <div><label className={labelCls}>Date *</label><input type="date" value={newHoliday.date} onChange={e=>setNewHoliday(h=>({...h,date:e.target.value}))} className={inputCls}/></div>
              <div><label className={labelCls}>Holiday Name *</label><input value={newHoliday.name} onChange={e=>setNewHoliday(h=>({...h,name:e.target.value}))} placeholder="e.g. Eid ul-Fitr" className={inputCls}/></div>
              <div><label className={labelCls}>Type</label>
                <select value={newHoliday.type} onChange={e=>setNewHoliday(h=>({...h,type:e.target.value as HolidayType}))} className={inputCls}>
                  <option value="public">Public Holiday</option><option value="company">Company Holiday</option>
                </select></div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={newHoliday.considerAttendance} onChange={e=>setNewHoliday(h=>({...h,considerAttendance:e.target.checked}))} className="w-4 h-4 accent-red-600"/>
                <div><div className={`text-sm font-medium ${txt}`}>Track attendance on this day</div>
                  <div className={`text-xs ${txtMuted}`}>Off = warning before marking. Won't deduct leave.</div></div>
              </label>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={()=>setShowHolidayForm(false)} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${border} ${darkMode?"hover:bg-[#1a1a1a]":"hover:bg-gray-50"}`}>Cancel</button>
              <button onClick={addHoliday} className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white">Add Holiday</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Note Modal ───────────────────────────────────────────────────────── */}
      {noteModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardCls} w-full max-w-sm shadow-2xl`}>
            <div className="flex items-center justify-between p-6 pb-4">
              <div>
                <h3 className={`text-base font-bold ${txt}`}>{noteModal.field==="note"?"📝 Add Note":"⚠️ Late Reason"}</h3>
                <p className={`text-xs ${txtMuted}`}>{employees.find(e=>e.id===noteModal.empId)?.name} · {fmtDate(selectedDate)}</p>
              </div>
              <button onClick={()=>setNoteModal(null)} className={`p-1.5 rounded-lg ${darkMode?"hover:bg-[#2a2a2a]":"hover:bg-gray-100"}`}><X size={16}/></button>
            </div>
            <div className="px-6 pb-4">
              <textarea value={noteValue} onChange={e=>setNoteValue(e.target.value)} rows={3}
                placeholder={noteModal.field==="note"?"e.g. Client visit…":"e.g. Traffic, medical appointment…"}
                className={`w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-red-500 resize-none ${darkMode?"bg-[#1a1a1a] border-[#2a2a2a] text-white":"border-gray-200"}`}/>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={()=>setNoteModal(null)} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${border} ${darkMode?"hover:bg-[#1a1a1a]":"hover:bg-gray-50"}`}>Cancel</button>
              <button onClick={()=>{ setRecords(prev=>prev.map(r=>r.date===selectedDate&&r.employeeId===noteModal.empId?{...r,[noteModal.field]:noteValue}:r)); setNoteModal(null); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
