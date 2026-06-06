# Frontend Product Requirements

## Project Overview

A clean, performance-driven web dashboard built with **Next.js**, **Tailwind CSS**, and **Recharts**. The frontend interacts with a local FastAPI backend to visualize running metrics and autonomic recovery metrics optimized specifically for the **Norwegian Method** of endurance training.

---

## 🔐 1. View: Authentication Page (`/login`)

A clean, minimal, distraction-free login screen to capture credentials.

### Functional Requirements:

* **Form Inputs:**
* Coros Hub Email Address. Use the email gabriele.roggero@gmail.com
* Coros Hub Password. Use the password: Y!nN2sDvCFZMQa3


* **Actions:**
* **Login Button:** Sends a secure `POST` request to the backend to authenticate. Upon success, stores an authorization token (or session state) and routes the user to the dashboard.
* **"Remember Me" Checkbox:** Securely caches credentials locally on `localhost` development layers for seamless re-entry.


* **Design & UI Feel:** * Dark, modern aesthetic (slate/zinc background) with a high-contrast action button (e.g., electric blue or neon green accent).

---

## 2. View: Main Dashboard Dashboard (`/dashboard`)

The core landing grid immediately visible after logging in. It prioritizes systemic stress balance, threshold accumulation, and micro-workout feeds.

### Component A: The Norwegian Metrics Header (Top Summary Cards)

Four high-impact KPI summary cards showing the current week's training vs. physiological state.

1. **Weekly Threshold Volume:** * *Metric:* Total running time spent strictly in Zone 2 during the current week (displayed as `HH:MM:SS`).
* *Visual indicator:* A progress bar showing how close I am to my targeted weekly threshold volume (e.g., 75% of a 90-minute target).


2. **Double-Threshold Days Completed:**
* *Metric:* Absolute integer count of days in the current block that contained $\ge 2$ threshold sessions.
* *Visual indicator:* Flame or block badges for each completed double day.


3. **Autonomic Status (Waking HRV):**
* *Metric:* Today's waking HRV score (e.g., `74 ms`) paired with a comparison indicator against my rolling baseline (e.g., `+4 ms above baseline`).
* *Color-coded status dot:* **Green** (Optimal), **Yellow** (Sympathetic Suppression / Monitor), or **Red** (System Overload / Reduce Intensity).


4. **Acute-to-Chronic Workload Ratio (ACWR):**
* *Metric:* The `training_load_ratio` value from the database (e.g., `1.15`).
* *Safety Flag:* Visually highlights if the index climbs above `1.3` (The structural injury risk sweet spot).



### Component B: Analytical Visualizations (The Charts)

Two high-resolution charts rendered natively using `recharts`.

* **Chart 1: Weekly Intensity Distribution (Stacked Bar Chart)**
* *X-Axis:* Weeks (or days of the current week).
* *Y-Axis:* Time (Minutes).
* *Bars:* Stacked vertically into 3 distinct color zones to track pyramidal/polarized volume:
* **Zone 1 (Base/Easy):** Light Slate Blue or Green.
* **Zone 2 (The Threshold Engine):** Deep Gold or Amber.
* **Zone 3 (VO2 Max/Hard):** Crimson Red.




* **Chart 2: Autonomic Recovery vs. Absolute Stress (Dual-Axis Line Chart)**
* *X-Axis:* Chronological Timeline (Last 14–30 days).
* *Left Y-Axis (Line 1):* Waking HRV (ms) overlaid with a subtle horizontal dashed line representing my `hrv_baseline`.
* *Right Y-Axis (Line 2):* Daily `training_load` score.
* *Goal:* Allows me to visually observe the delayed drops in HRV 24–48 hours after high-stress Double-Threshold days.



### Component C: System Controls & Data Stream

A structural side panel or footer deck handling manual updates and activity history.

* **Manual Synchronization Trigger:**
* A high-visibility **"Sync Training Data"** button.
* When clicked, changes to a loading state ("Connecting to Coros Hub via MCP...") and triggers the backend route.
* Shows a success toast notice once tables are refreshed.


* **Recent Workouts Feed (The Activity Table):**
* A clean list showing my last 10 activities:
* `Date` | `Activity Name` | `Distance (km)` | `Duration` | `Avg HR` | `Threshold Volume (Z2 %)` | `Double Day (Yes/No)`


* Clicking a row opens a detailed modal drawer where I can inspect second-by-second **Cardiovascular Drift** metrics or pace tracking from the JSONB data stream.



---

## 3. Design Tokens & Styling Guide

* **Framework:** Tailwind CSS.
* **Theme:** Dark mode by default to replicate elite sports performance software (Strava Saucond, TrainingPeaks WKO, Coros Hub).
* *Primary Background:* `bg-zinc-950` or `bg-slate-950`
* *Cards/Containers:* `bg-zinc-900` with subtle borders (`border-zinc-800`).
* *Typography:* Clean sans-serif font system (`Inter` or system default sans), utilizing numerical tabular-nums utility formatting for training times and paces to prevent alignment jumping.



---