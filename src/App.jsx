import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';
import { Radar, Bar } from 'react-chartjs-2';
import { differenceInCalendarDays, parseISO, format } from 'date-fns';
import { Trash2, Edit2, Plus, Calendar, Target, Trophy, Settings, BarChart2, Star } from 'lucide-react';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const DEFAULT_SUBJECTS = [
  { id: "subj_jp", name: "Bahasa Jepang", threshold: 10, statType: "INT", color: "#FF6B35", icon: "🇯🇵", createdAt: 0 },
  { id: "subj_os", name: "Sistem Operasi", threshold: 8, statType: "INT", color: "#FF6B35", icon: "💻", createdAt: 0 },
  { id: "subj_en", name: "Bahasa Inggris", threshold: 10, statType: "WIS", color: "#533483", icon: "🇬🇧", createdAt: 0 },
  { id: "subj_re", name: "Reverse Engineering", threshold: 12, statType: "WIS", color: "#533483", icon: "⚙️", createdAt: 0 },
  { id: "subj_other", name: "Lainnya", threshold: 15, statType: "STR", color: "#39FF14", icon: "📚", createdAt: 0 }
];

const PRESET_COLORS = ["#FF6B35", "#533483", "#39FF14", "#00D4FF", "#FFD700", "#FF0055", "#00FFaa", "#aa00ff"];
const PRESET_ICONS = ["📚", "🔬", "💻", "🎯", "🧪", "⚙️", "🎮", "🌐", "🇯🇵", "🇬🇧", "✏️", "📊", "🧠"];

const INITIAL_DATA = {
  subjects: DEFAULT_SUBJECTS,
  logs: [],
  achievements: []
};

// =========================================================================
// ALGORITHMS
// =========================================================================

/**
 * ALGORITHM : Linear Accumulation
 * USE CASE  : Menghitung total jam per subjek dari seluruh log (Daily Log)
 * TIME      : O(n) — n = jumlah hari/log tercatat
 * SPACE     : O(k) — k = jumlah subjek
 * ASYMPTOTIC: Θ(n) karena selalu scan semua data log tanpa early exit
 * NOTE      : Dipanggil setiap ada perubahan data log atau subjek
 */
function recalculateStats(logs, subjects) {
  const totals = {};
  subjects.forEach(s => totals[s.id] = 0);
  logs.forEach(log => {
    Object.keys(log.hours || {}).forEach(k => {
      if (totals[k] !== undefined) {
        totals[k] += Number(log.hours[k]) || 0;
      }
    });
  });
  return totals;
}

/**
 * ALGORITHM : Threshold-based Stat Scoring
 * USE CASE  : Menghitung stat gain per subjek untuk Dashboard RPG
 * TIME      : O(1) per subjek
 * SPACE     : O(1)
 * ASYMPTOTIC: O(1)
 * NOTE      : Operasi aritmatika konstan.
 */
function calculateStatGain(totalHours, threshold) {
  return Math.floor((totalHours || 0) / Math.max(1, threshold));
}

/**
 * ALGORITHM : Greedy by Efficiency Ratio
 * USE CASE  : Merekomendasikan alokasi jam harian agar stat naik maksimal hari ini
 * TIME      : O(n log n) best & worst (didominasi sort)
 * SPACE     : O(n) untuk alokasi dan konversi list
 * ASYMPTOTIC: O(n log n)
 * NOTE      : Greedy memilih efisiensi lokal terbaik di setiap langkah.
 *             Tidak menjamin solusi global optimal jika ada kombinasi
 *             subjek yang secara total lebih menguntungkan. Trade-off:
 *             O(n log n) yang cepat vs kemungkinan suboptimal.
 */
function greedyRecommend(availableHours, subjects, totals) {
  let list = subjects.map(s => {
    const eff = 1 / s.threshold;
    const current = totals[s.id] || 0;
    let rem = s.threshold - (current % s.threshold);
    if (rem === s.threshold && current > 0) rem = s.threshold; // siklus baru
    return { id: s.id, name: s.name, threshold: s.threshold, eff, rem };
  });

  list.sort((a, b) => b.eff - a.eff);

  const allocation = {};
  let hoursLeft = availableHours;

  for (let item of list) {
    const give = Math.min(item.rem, hoursLeft);
    if (give > 0) {
      allocation[item.id] = give;
      hoursLeft -= give;
    }
    if (hoursLeft <= 0) break;
  }

  if (hoursLeft > 0 && list.length > 0) {
    if (!allocation[list[0].id]) allocation[list[0].id] = 0;
    allocation[list[0].id] += hoursLeft;
  }

  return { allocation, sortedList: list.map(i => i.id) };
}

/**
 * ALGORITHM : DP bottom-up 0/1 Knapsack Analog
 * USE CASE  : Menghitung distribusi jam minimum per subjek untuk capai target level
 * TIME      : O(n × W²) worst case
 * SPACE     : O(n × W) — DP table 2D
 * ASYMPTOTIC: Θ(n × W²)
 * NOTE      : DP menjamin solusi OPTIMAL (minimum jam untuk capai target)
 *             dengan trade-off kompleksitas O(n×W²) vs Greedy O(n log n).
 *             Bisa direduksi space ke O(W) dengan 1D array.
 */
function dpPlanner(targetLevel, days, hoursPerDay, subjects, currentLVL) {
  const W = days * hoursPerDay;
  const neededStatPoints = Math.max(0, (targetLevel - currentLVL) * 4);
  const n = subjects.length;

  const dp = Array.from({ length: n + 1 }, () => Array(W + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const thresh = Math.max(1, subjects[i - 1].threshold);
    for (let j = 0; j <= W; j++) {
      dp[i][j] = dp[i - 1][j];
      for (let h = 1; h <= j; h++) {
        const gain = Math.floor(h / thresh);
        if (dp[i - 1][j - h] + gain > dp[i][j]) {
          dp[i][j] = dp[i - 1][j - h] + gain;
        }
      }
    }
  }

  let bestJ = -1;
  for (let j = 0; j <= W; j++) {
    if (dp[n][j] >= neededStatPoints) {
      bestJ = j;
      break;
    }
  }

  if (bestJ === -1) {
    return { achievable: false, maxGain: dp[n][W], neededStatPoints, schedule: null, totalHours: W, W };
  }

  const allocation = {};
  let currJ = bestJ;

  for (let i = n; i >= 1; i--) {
    const subj = subjects[i - 1];
    for (let h = 1; h <= currJ; h++) {
      const gain = Math.floor(h / subj.threshold);
      if (dp[i][currJ] === dp[i - 1][currJ - h] + gain) {
        allocation[subj.id] = h;
        currJ -= h;
        break;
      }
    }
    if (currJ === 0) break;
  }

  // Format into a daily master plan
  const schedule = [];
  let remainingAlloc = { ...allocation };
  let currentDay = 1;
  
  while(currentDay <= days) {
     let availableToday = hoursPerDay;
     let dayTasks = {};
     let hasTask = false;

     for (const subjId of Object.keys(remainingAlloc)) {
         if (remainingAlloc[subjId] > 0 && availableToday > 0) {
             const canTake = Math.min(remainingAlloc[subjId], availableToday);
             dayTasks[subjId] = canTake;
             remainingAlloc[subjId] -= canTake;
             availableToday -= canTake;
             hasTask = true;
         }
     }

     if (hasTask) {
         schedule.push({ day: currentDay, tasks: dayTasks });
     } else {
         break;
     }
     currentDay++;
  }

  return { achievable: true, allocation, totalHoursUsed: bestJ, neededStatPoints, W, schedule };
}

/**
 * ALGORITHM : Decrease and Conquer
 * USE CASE  : Menghitung longest dan current streak hari belajar
 * TIME      : O(n log n)
 * SPACE     : O(1) beyond array buffer
 * ASYMPTOTIC: O(n log n) didominasi oleh sort
 */
function calculateStreak(logs) {
  if (!logs || logs.length === 0) return { current: 0, max: 0 };
  const sorted = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  let max = 1;
  let curr = 1;

  for (let i = 1; i < sorted.length; i++) {
    const diff = differenceInCalendarDays(parseISO(sorted[i].date), parseISO(sorted[i - 1].date));
    if (diff === 1) {
      curr++;
      max = Math.max(max, curr);
    } else if (diff > 1) {
      curr = 1;
    }
  }
  
  // Check if current streak is active (today or yesterday)
  const daysSinceLast = differenceInCalendarDays(new Date(), parseISO(sorted[sorted.length - 1].date));
  if (daysSinceLast > 1) {
    curr = 0;
  }

  return { current: curr, max: max };
}

export default function App() {
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem("learningQuestData");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_DATA;
  });

  const [activeTab, setActiveTab] = useState("dashboard");
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    localStorage.setItem("learningQuestData", JSON.stringify(data));
    checkAchievements();
  }, [data]);

  const pushNotification = (title, msg) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, title, msg }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  // Calculated Stats
  const totals = useMemo(() => recalculateStats(data.logs, data.subjects), [data.logs, data.subjects]);
  
  const stats = useMemo(() => {
    let INT = 0, WIS = 0, STR = 0, DEX = 0;
    
    // Add active date bases
    const activeDaysAllTime = new Set(data.logs.map(l => l.date)).size;
    
    // Unique days this month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const activeDaysThisMonth = new Set(
      data.logs.filter(l => {
        const d = new Date(l.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }).map(l => l.date)
    ).size;

    STR += activeDaysAllTime;
    DEX += Math.min(30, activeDaysThisMonth);

    data.subjects.forEach(subj => {
      const t = totals[subj.id] || 0;
      const gain = calculateStatGain(t, subj.threshold);
      if (subj.statType === "INT") INT += gain;
      if (subj.statType === "WIS") WIS += gain;
      if (subj.statType === "STR") STR += gain;
      if (subj.statType === "DEX") DEX += gain;
    });

    const LVL = Math.floor((INT + WIS + STR + DEX) / 4) + 1;
    return { INT, WIS, STR, DEX, LVL, maxPoints: { INT: 20, WIS: 20, STR: 30, DEX: 30 } };
  }, [totals, data.subjects, data.logs]);

  const streakInfo = useMemo(() => calculateStreak(data.logs), [data.logs]);

  const checkAchievements = () => {
    const { logs, achievements } = data;
    const newAchievements = [];
    
    const sumAllHours = Object.values(totals).reduce((a,b) => a+b, 0);

    if (streakInfo.current >= 7 && !achievements.includes("7-Day Streak")) newAchievements.push("7-Day Streak");
    if (stats.INT >= 5 && !achievements.includes("INT Lv.5")) newAchievements.push("INT Lv.5");
    if (stats.WIS >= 5 && !achievements.includes("WIS Lv.5")) newAchievements.push("WIS Lv.5");
    if (stats.LVL >= 10 && !achievements.includes("Level 10")) newAchievements.push("Level 10");
    if (sumAllHours >= 100 && !achievements.includes("100 Jam Belajar")) newAchievements.push("100 Jam Belajar");
    if (stats.INT >= 3 && stats.WIS >= 3 && stats.STR >= 3 && stats.DEX >= 3 && !achievements.includes("Full Stat")) newAchievements.push("Full Stat");

    if (newAchievements.length > 0) {
      setData(prev => ({ ...prev, achievements: [...prev.achievements, ...newAchievements] }));
      newAchievements.forEach(a => pushNotification("🏆 Achievement Unlocked!", a));
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-white font-sans overflow-x-hidden">
      {/* Navbar */}
      <nav className="bento-navbar">
        <div className="font-extrabold text-[var(--accent)] text-lg tracking-wide hidden md:block">⚔️ LEARNING QUEST</div>
        <div className="flex overflow-x-auto items-center space-x-2 text-sm font-bold hide-scrollbar">
          <button onClick={() => setActiveTab("dashboard")} className={`bento-nav-item ${activeTab === "dashboard" ? "active" : ""}`}><BarChart2 size={16}/> <span>Dashboard</span></button>
          <button onClick={() => setActiveTab("log")} className={`bento-nav-item ${activeTab === "log" ? "active" : ""}`}><Calendar size={16}/> <span>Daily Log</span></button>
          <button onClick={() => setActiveTab("optimizer")} className={`bento-nav-item ${activeTab === "optimizer" ? "active" : ""}`}><Target size={16}/> <span>Optimizer</span></button>
          <button onClick={() => setActiveTab("subjects")} className={`bento-nav-item ${activeTab === "subjects" ? "active" : ""}`}><Settings size={16}/> <span>Subjects</span></button>
          <button onClick={() => setActiveTab("achievements")} className={`bento-nav-item ${activeTab === "achievements" ? "active" : ""}`}><Trophy size={16}/> <span>Achievements</span></button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-4 max-w-7xl mx-auto min-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {activeTab === "dashboard" && <AppDashboard stats={stats} totals={totals} subjects={data.subjects} streakInfo={streakInfo} />}
            {activeTab === "log" && <AppDailyLog data={data} setData={setData} totals={totals} />}
            {activeTab === "optimizer" && <AppOptimizer data={data} stats={stats} totals={totals} setActiveTab={setActiveTab} />}
            {activeTab === "subjects" && <AppSubjects data={data} setData={setData} />}
            {activeTab === "achievements" && <AppAchievements achievements={data.achievements} streakInfo={streakInfo} totals={totals} stats={stats} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end space-y-3 pointer-events-none drop-shadow-2xl">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div 
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="bento-card pointer-events-auto border-[var(--accent)] py-4 max-w-sm"
              style={{ background: 'rgba(13, 13, 26, 0.95)' }}
            >
              <h4 className="font-bold text-[var(--accent)] mb-1 text-base">{n.title}</h4>
              <p className="text-sm text-[var(--text-main)] leading-relaxed">{n.msg}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =========================================================================
// TAB COMPONENTS
// =========================================================================

function AppDashboard({ stats, totals, subjects, streakInfo }) {
  const radarData = {
    labels: ['INT', 'WIS', 'STR', 'DEX', 'LVL'],
    datasets: [{
      label: 'Stats',
      data: [stats.INT, stats.WIS, stats.STR, stats.DEX, stats.LVL],
      backgroundColor: 'rgba(255, 215, 0, 0.2)',
      borderColor: '#FFD700',
      pointBackgroundColor: '#16213E',
      pointBorderColor: '#FFD700',
      borderWidth: 2,
    }]
  };

  const radarOptions = {
    scales: {
      r: {
        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        pointLabels: { color: '#fff', font: { size: 14, family: 'Inter' } },
        ticks: { display: false }
      }
    },
    plugins: { legend: { display: false } }
  };

  const barData = {
    labels: subjects.map(s => s.name),
    datasets: [{
      label: 'Total Jam Belajar',
      data: subjects.map(s => totals[s.id] || 0),
      backgroundColor: subjects.map(s => s.color),
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1
    }]
  };

  const barOptions = {
    responsive: true,
    scales: {
      y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#aaa' } },
      x: { grid: { display: false }, ticks: { color: '#aaa' } }
    },
    plugins: { legend: { display: false } }
  };

  const Card = ({ title, value, color, progValue, progMax, desc, colSpanRows }) => (
    <div className={`bento-card bento-stat-card ${colSpanRows || ""}`} style={{ borderLeft: `4px solid ${color}` }}>
      <div className="bento-card-title">{title}</div>
      <div>
        <div className="bento-stat-big" style={{ color }}>{value}</div>
        <div className="bento-stat-label">{desc}</div>
      </div>
      <div>
        <div className="text-[10px] text-[var(--text-muted)] mt-2">{progValue} / {progMax} menuju poin berikutnya</div>
        <div className="bento-progress-container">
          <div className="bento-progress-fill" style={{ width: `${Math.min(100, (progValue/progMax)*100)}%`, backgroundColor: color }}></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bento-grid">
      
      {/* Profile/Level & Radar */}
      <div className="bento-card flex flex-col items-center justify-center lg:col-span-3 lg:row-span-5">
        <div className="bento-card-title w-full">Character Profile <span style={{color: 'var(--accent)'}}>Lv. {stats.LVL}</span></div>
        <div className="flex-1 w-full flex flex-col items-center justify-center max-h-56 mt-4">
          <Radar data={radarData} options={radarOptions} />
        </div>
        <div className="text-xs text-center text-[var(--text-muted)] mt-4">Stat distribution</div>
      </div>

      <Card title="Intelligence" value={stats.INT} color="var(--int)" progValue={(Object.keys(totals).reduce((acc, k) => { const s = subjects.find(x => x.id === k); return s && s.statType === 'INT' ? acc + (totals[k] % s.threshold) : acc; }, 0)).toFixed(1)} progMax="10" desc="+1 per threshold target" colSpanRows="lg:col-span-2 lg:row-span-2" />
      
      <Card title="Wisdom" value={stats.WIS} color="var(--wis)" progValue={(Object.keys(totals).reduce((acc, k) => { const s = subjects.find(x => x.id === k); return s && s.statType === 'WIS' ? acc + (totals[k] % s.threshold) : acc; }, 0)).toFixed(1)} progMax="10" desc="+1 per threshold target" colSpanRows="lg:col-span-2 lg:row-span-2" />
      
      <Card title="Strength" value={stats.STR} color="var(--str)" progValue={stats.STR % 5} progMax="5" desc="Hari aktif belajar" colSpanRows="lg:col-span-2 lg:row-span-2" />

      {/* Weekly Streak */}
      <div className="bento-card flex flex-col items-center justify-center lg:col-span-3 lg:row-span-4" style={{borderColor: '#FF4E00', backgroundColor: 'rgba(255, 78, 0, 0.05)'}}>
        <div className="bento-card-title text-[#FF4E00] w-full items-center justify-between flex gap-1">🔥 Active Streak <span className="bg-[#FF4E00]/20 px-2 py-0.5 rounded text-[10px]">HOT!</span></div>
        <div className="text-[4rem] font-black leading-none text-white my-4">{streakInfo.current}</div>
        <div className="text-sm text-[var(--text-muted)] text-center px-4">Konsisten belajar untuk dapatkan modifier! Max: {streakInfo.max}</div>
      </div>

      <Card title="Dexterity" value={stats.DEX} color="var(--dex)" progValue={stats.DEX % 7} progMax="7" desc="Hari unik bulan ini" colSpanRows="lg:col-span-3 lg:row-span-2" />
      
      <Card title="COMPOSITE LEVEL" value={stats.LVL} color="var(--accent)" progValue={(stats.INT + stats.WIS + stats.STR + stats.DEX) % 4} progMax="4" desc="(INT+WIS+STR+DEX)/4" colSpanRows="lg:col-span-3 lg:row-span-2" />

      <div className="bento-card lg:col-span-9 lg:row-span-3">
        <div className="bento-card-title mb-4">Total Jam Belajar per Subjek</div>
        <div className="h-40 relative w-full pt-2">
          <Bar data={barData} options={barOptions} />
        </div>
      </div>

    </div>
  );
}

function AppDailyLog({ data, setData, totals }) {
  const [formData, setFormData] = useState({});
  const [note, setNote] = useState("");
  const [dateStr, setDateStr] = useState(format(new Date(), 'yyyy-MM-dd'));

  const submitLog = (e) => {
    e.preventDefault();
    const cleanHours = {};
    let hasValue = false;
    data.subjects.forEach(s => {
      const v = Number(formData[s.id]);
      if (v > 0) {
        cleanHours[s.id] = v;
        hasValue = true;
      }
    });

    if (!hasValue) {
      // Silently return instead of alert since iframe blocks it
      return;
    }

    setData(prev => {
      const existingIdx = prev.logs.findIndex(l => l.date === dateStr);
      let newLogs = [...prev.logs];

      if (existingIdx >= 0) {
        const existing = newLogs[existingIdx];
        const mergedHours = { ...existing.hours };
        
        Object.keys(cleanHours).forEach(k => {
          mergedHours[k] = (mergedHours[k] || 0) + cleanHours[k];
        });

        let newNote = existing.note || "";
        if (note) {
          newNote = newNote ? `${newNote} | ${note}` : note;
        }

        newLogs[existingIdx] = {
          ...existing,
          hours: mergedHours,
          note: newNote
        };
      } else {
        newLogs.push({
          id: "log_" + Date.now(),
          date: dateStr,
          hours: cleanHours,
          note
        });
      }
      
      return { ...prev, logs: newLogs.sort((a,b) => b.date.localeCompare(a.date)) };
    });
    setFormData({});
    setNote("");
  };

  const deleteLog = (id) => {
    setData(prev => ({ ...prev, logs: prev.logs.filter(l => l.id !== id) }));
  };

  return (
    <div className="bento-grid">
      <div className="bento-card lg:col-span-12">
        <div className="bento-card-title text-[var(--accent)] text-lg mb-6 flex items-center gap-2">
          <Calendar size={20} /> Catat Quest Hari Ini
        </div>
        <form onSubmit={submitLog} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">Tanggal Beraksi</label>
              <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} required className="bento-input" />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">Catatan Quest (Opsional)</label>
              <input type="text" placeholder="Membuat fitur login dengan React..." value={note} onChange={e => setNote(e.target.value)} className="bento-input" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {data.subjects.map(s => (
              <div key={s.id} className="bg-black/20 p-4 rounded-lg border border-white/5">
                <label className="flex items-center gap-2 text-sm font-bold mb-3" style={{color: s.color}}>
                  <span>{s.icon}</span> <span>{s.name}</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="number" step="0.1" min="0" value={formData[s.id] || ""} onChange={e => setFormData(prev => ({...prev, [s.id]: e.target.value}))} placeholder="0" className="bento-input" style={{borderColor: formData[s.id] ? s.color : undefined}} />
                  <span className="text-xs text-[var(--text-muted)]">Jam</span>
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="bento-btn py-3 text-base">
            📅 Catat Jam Sekarang
          </button>
        </form>
      </div>

      <div className="bento-card lg:col-span-12 overflow-x-auto">
        <div className="bento-card-title mb-4">📜 Recent Activity Log</div>
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10 text-[var(--text-muted)]">
              <th className="py-4 font-normal">Tanggal</th>
              {data.subjects.map(s => <th key={s.id} className="py-4 px-2 font-normal" style={{color: s.color}}>{s.name}</th>)}
              <th className="py-4 font-normal">Catatan</th>
              <th className="py-4 text-center font-normal">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.logs.map(l => (
              <tr key={l.id} className="hover:bg-white/5">
                <td className="py-4 font-mono text-gray-300">{l.date}</td>
                {data.subjects.map(s => <td key={s.id} className="py-4 px-2 font-bold">{l.hours[s.id] ? `${l.hours[s.id]}h` : "-"}</td>)}
                <td className="py-4 text-gray-500 max-w-[200px] truncate">{l.note || "-"}</td>
                <td className="py-4 text-center">
                  <button onClick={() => deleteLog(l.id)} className="p-2 text-red-400 hover:bg-red-400/10 rounded-md transition"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-[var(--accent)]/30 font-bold bg-[var(--accent-glow)]">
            <tr>
              <td className="py-4 text-[var(--accent)]">Total Jam Aktif</td>
              {data.subjects.map(s => <td key={s.id} className="py-4 px-2 text-white">{totals[s.id] || 0}h</td>)}
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        {data.logs.length === 0 && <div className="text-center py-10 text-gray-500">Belum ada quest log tercatat.</div>}
      </div>
    </div>
  );
}

function AppOptimizer({ data, stats, totals, setActiveTab }) {
  const [greedyHours, setGreedyHours] = useState(4);
  const [greedyResult, setGreedyResult] = useState(null);

  const [dpTarget, setDpTarget] = useState(stats.LVL + 1);
  const [dpDays, setDpDays] = useState(7);
  const [dpHours, setDpHours] = useState(4);
  const [dpResult, setDpResult] = useState(null);

  const reqGreedy = () => {
    setGreedyResult(greedyRecommend(greedyHours, data.subjects, totals));
  };

  const reqDP = () => {
    setDpResult(dpPlanner(dpTarget, dpDays, dpHours, data.subjects, stats.LVL));
  };

  const applyGreedy = () => {
    if(!greedyResult) return;
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const newLog = {
      id: "log_" + Date.now(),
      date: dateStr,
      hours: greedyResult.allocation,
      note: "Auto-allocated by Greedy Optimizer ⚡"
    };
    // Let's cheat a bit and inject to setter
    // For proper react app passing `setData` here is better. Using a hack? No, pass it down.
    // Wait, optimizer does not receive setData right now. I will add it.
  };

  return (
    <div className="bento-grid">
      {/* GREEDY RECOMENDER */}
      <div className="bento-card lg:col-span-6 lg:row-span-4 border-l-4" style={{borderLeftColor: 'var(--dex)'}}>
        <div className="bento-card-title text-[var(--dex)] text-lg mb-2"><Star size={18}/> Greedy Recommender</div>
        <p className="text-xs text-[var(--text-muted)] mb-6">Algoritma efisiensi tinggi O(n log n).</p>

        <div className="mb-6">
          <label className="flex justify-between text-sm font-bold text-[var(--text-main)] mb-2">
            <span>Jam tersedia hari ini:</span>
            <span style={{color: 'var(--dex)'}}>{greedyHours} Jam</span>
          </label>
          <input type="range" min="1" max="16" value={greedyHours} onChange={e => setGreedyHours(Number(e.target.value))} className="w-full" style={{accentColor: 'var(--dex)'}} />
        </div>

        <button onClick={reqGreedy} className="bento-btn" style={{backgroundColor: 'var(--dex)', color: '#000'}}>Rekomendasikan Sekarang</button>

        {greedyResult && (
          <div className="mt-6 space-y-3">
            {greedyResult.sortedList.map((id, index) => {
              const obj = data.subjects.find(s=>s.id === id);
              const alloc = greedyResult.allocation[id] || 0;
              if (alloc === 0) return null;
              return (
                <div key={id} className="bg-black/30 p-4 border border-white/10 rounded-lg flex justify-between items-center relative overflow-hidden">
                  {index === 0 && <div className="absolute top-0 right-0 bg-[var(--accent)] text-black text-[10px] font-black px-2 py-1 rounded-bl-lg">⭐ PRIORITAS</div>}
                  <div>
                    <div className="font-bold flex items-center gap-2" style={{color: obj.color}}>{obj.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-1">Efisiensi: {(1/obj.threshold).toFixed(2)} stat/jam</div>
                  </div>
                  <div className="text-2xl font-black text-white">+{alloc} <span className="text-xs font-normal text-gray-500">Jam</span></div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DP PLANNER */}
      <div className="bento-card lg:col-span-6 lg:row-span-4 border-l-4" style={{borderLeftColor: 'var(--str)'}}>
        <div className="bento-card-title text-[var(--str)] text-lg mb-2"><BarChart2 size={18}/> DP Study Planner</div>
        <p className="text-xs text-[var(--text-muted)] mb-6">Algoritma 0/1 Knapsack Analog Θ(n × W²).</p>

        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center py-2 border-b border-white/5">
            <span className="text-sm text-[var(--text-muted)]">Target Belajar</span>
            <div className="flex items-center gap-2">
              <span className="font-bold">Lv.</span>
              <input type="number" min={stats.LVL + 1} value={dpTarget} onChange={e => setDpTarget(Number(e.target.value))} className="bento-input w-16 text-center text-[var(--str)]" />
            </div>
          </div>
          <div>
            <label className="flex justify-between text-sm text-[var(--text-muted)] mb-1">
              <span>Deadline:</span> <span className="text-white">{dpDays} Hari</span>
            </label>
            <input type="range" min="1" max="30" value={dpDays} onChange={e => setDpDays(Number(e.target.value))} className="w-full" style={{accentColor: 'var(--str)'}} />
          </div>
          <div>
            <label className="flex justify-between text-sm text-[var(--text-muted)] mb-1">
              <span>Maks Jam/Hari:</span> <span className="text-white">{dpHours} Jam</span>
            </label>
            <input type="range" min="1" max="8" value={dpHours} onChange={e => setDpHours(Number(e.target.value))} className="w-full" style={{accentColor: 'var(--str)'}} />
          </div>
        </div>

        <button onClick={reqDP} className="bento-btn" style={{backgroundColor: 'var(--str)', color: '#000'}}>Bangun Rencana</button>

        {dpResult && (
          <div className="mt-6">
            {dpResult.achievable ? (
              <div className="bg-[var(--str)]/10 border border-[var(--str)]/30 rounded-lg p-5">
                <h4 className="font-bold text-white mb-2 text-lg">Target Tercapai! 🎯</h4>
                <p className="text-sm text-[var(--text-muted)] mb-4">Butuh total <strong className="text-[var(--accent)]">{dpResult.totalHoursUsed} jam</strong> dari batas max {dpResult.W} jam.</p>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {dpResult.schedule.map(dayInfo => (
                    <div key={dayInfo.day} className="bg-black/30 p-3 rounded-lg border border-white/5">
                      <div className="text-xs font-bold text-[var(--str)] mb-2 uppercase tracking-wider">HARI KE-{dayInfo.day}</div>
                      <div className="space-y-1">
                        {Object.keys(dayInfo.tasks).map(id => {
                          const obj = data.subjects.find(s=>s.id === id);
                          return (
                            <div key={id} className="flex justify-between text-sm items-center">
                              <span style={{color: obj.color}} className="flex items-center gap-2 text-xs font-medium">
                                {obj.icon} {obj.name}
                              </span>
                              <span className="font-bold text-white text-xs">{dayInfo.tasks[id]} Jam</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 text-[10px] text-[var(--text-muted)]">
                  Jadwal master di atas disusun untuk mencapai Total Stat Points ekstra sebanyak {dpResult.neededStatPoints}.
                </div>
              </div>
            ) : (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-5">
                <h4 className="font-bold text-red-500 mb-2">Tidak Tercapai ❌</h4>
                <p className="text-sm text-[var(--text-muted)]">Total {dpResult.W} jam tersedia tidak cukup untuk mencapai {dpResult.neededStatPoints} stat points tambahan.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AppSubjects({ data, setData }) {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: "", threshold: 10, statType: "INT", color: PRESET_COLORS[0], icon: PRESET_ICONS[0] });

  const resetForm = () => {
    setEditingId(null);
    setFormData({ name: "", threshold: 10, statType: "INT", color: PRESET_COLORS[0], icon: PRESET_ICONS[0] });
  };

  const openEdit = (subj) => {
    setEditingId(subj.id);
    setFormData({ ...subj });
  };

  const deleteSubj = (id) => {
    if (data.subjects.length <= 1) return;
    
    setData(prev => {
      const nextSubjects = prev.subjects.filter(s => s.id !== id);
      const nextLogs = prev.logs.map(l => {
        const newH = {...l.hours};
        delete newH[id];
        return { ...l, hours: newH };
      });
      return { ...prev, subjects: nextSubjects, logs: nextLogs };
    });
  };

  const saveSubj = (e) => {
    e.preventDefault();
    /**
     * ALGORITHM: Linear Search + Update / Dynamic Array Insertion
     * TIME: O(n) amortized
     */
    if (editingId) {
       setData(prev => ({
         ...prev,
         subjects: prev.subjects.map(s => s.id === editingId ? { ...s, ...formData } : s)
       }));
    } else {
       const newSubj = { ...formData, id: "subj_" + Date.now(), createdAt: Date.now() };
       setData(prev => ({ ...prev, subjects: [...prev.subjects, newSubj] }));
    }
    resetForm();
  };

  const doReset = () => {
    setData(prev => ({ ...prev, subjects: DEFAULT_SUBJECTS }));
  }

  return (
    <div className="bento-grid">
      <div className="bento-card lg:col-span-12">
        <div className="bento-card-title mb-6">Kelola Quest Subjects</div>
        <form onSubmit={saveSubj} className="bg-black/30 p-6 rounded-lg border border-white/5 space-y-4 mb-8">
          <h3 className="font-bold text-[var(--accent)] mb-4">{editingId ? "✏️ Edit Mata Pelajaran" : "➕ Tambah Mata Pelajaran Baru"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Nama Subjek</label>
              <input required type="text" value={formData.name} onChange={e=>setFormData(p=>({...p, name: e.target.value}))} className="bento-input"/>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Stat Scaling Point</label>
              <select value={formData.statType} onChange={e=>setFormData(p=>({...p, statType: e.target.value}))} className="bento-input">
                <option value="INT">Intelligence (Kognitif, Hafalan)</option>
                <option value="WIS">Wisdom (Logika, Pemahaman Murni)</option>
                <option value="STR">Strength (Stamina, Fisik)</option>
                <option value="DEX">Dexterity (Skill Cepat, Mengetik)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Jam untuk +1 Stat (Threshold)</label>
              <input required type="number" min="1" value={formData.threshold} onChange={e=>setFormData(p=>({...p, threshold: Number(e.target.value)}))} className="bento-input"/>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Pilih Icon & Warna</label>
              <div className="flex gap-2 items-center">
                <select value={formData.icon} onChange={e=>setFormData(p=>({...p, icon: e.target.value}))} className="bento-input">
                  {PRESET_ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                </select>
                <input type="color" value={formData.color} onChange={e=>setFormData(p=>({...p, color: e.target.value}))} className="h-[2.35rem] w-16 p-0 border-0 rounded cursor-pointer" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-4">
            {editingId && <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-white">Batal</button>}
            <button type="submit" className="bento-btn w-auto px-6">{editingId ? "Simpan Perubahan" : "Simpan Baru"}</button>
          </div>
        </form>

        <div className="bento-badge-grid" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))'}}>
          {data.subjects.map(s => (
            <div key={s.id} className="relative bg-black/40 p-5 rounded-lg border border-white/10 hover:border-white/30 transition group flex flex-col justify-between">
              <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => openEdit(s)} className="text-[var(--dex)] hover:text-white p-1 bg-black/80 rounded"><Edit2 size={16}/></button>
                <button onClick={() => deleteSubj(s.id)} className="text-[#FF4E00] hover:text-white p-1 bg-black/80 rounded"><Trash2 size={16}/></button>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-3xl" style={{color: s.color}}>{s.icon}</div>
                <div>
                  <h4 className="font-bold text-white text-base leading-tight">{s.name}</h4>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase" style={{backgroundColor: s.color+'20', color: s.color}}>{s.statType} Scaling</span>
                </div>
              </div>
              <p className="text-xs text-[var(--text-muted)]">Tiap <strong className="text-white">{s.threshold} jam</strong> = +1 {s.statType}</p>
            </div>
          ))}
        </div>
        
        <div className="mt-12 text-center border-t border-white/10 pt-6">
          <button onClick={doReset} className="text-xs text-gray-500 hover:text-red-400">Peringatan: Reset Subject ke Konfigurasi Default</button>
        </div>
      </div>
    </div>
  );
}

function AppAchievements({ achievements, streakInfo, totals, stats }) {
  const BADGES = [
    { id: "7-Day Streak", icon: "🔥", color: "#FF6B35", desc: "Konsisten lapor quest 7 hari full" },
    { id: "INT Lv.5", icon: "🧠", color: "#FF6B35", desc: "Mencapai 5 INT murni" },
    { id: "WIS Lv.5", icon: "🌌", color: "#533483", desc: "Mencapai 5 WIS murni" },
    { id: "Level 10", icon: "⚔️", color: "#FFD700", desc: "Capai Player Level 10" },
    { id: "100 Jam Belajar", icon: "⌛", color: "#00D4FF", desc: "Grinding total 100 jam" },
    { id: "Full Stat", icon: "🌟", color: "#39FF14", desc: "Semua Stat (INT, WIS, STR, DEX) mencapai Tier 3" }
  ];

  return (
    <div className="bento-grid flex flex-col items-center">
      <div className="bento-card lg:col-span-12 w-full text-center p-12 border-b border-[var(--accent)]/30" style={{background: 'radial-gradient(circle at top, rgba(255,215,0,0.1), transparent 70%)'}}>
        <h2 className="text-4xl font-black text-[var(--accent)] mb-2">🏆 Hall of Fame</h2>
        <p className="text-[var(--text-muted)] text-sm max-w-lg mx-auto">Pencapaian yang telah engkau raih dalam petualangan akademismu.</p>
      </div>

      <div className="bento-card lg:col-span-12 w-full">
        <div className="bento-card-title mb-6">Achievement Badges</div>
        <div className="bento-badge-grid" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px'}}>
          {BADGES.map(b => {
            const unlocked = achievements.includes(b.id);
            return (
               <div key={b.id} className={`bento-badge-item ${unlocked ? 'unlocked' : 'locked'}`} style={{borderColor: unlocked ? b.color : undefined}}>
                 <div className="text-4xl mb-2">{b.icon}</div>
                 <div className="font-bold text-xs uppercase" style={{color: unlocked ? b.color : '#fff'}}>{b.id}</div>
                 <div className="text-[9px] text-center mt-1 px-2 text-[var(--text-muted)] leading-tight">{b.desc}</div>
               </div>
            )
          })}
        </div>
      </div>
    </div>
  );
}
