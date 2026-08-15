const firebaseConfig = {
  apiKey: "AIzaSyCdYIjwo5UDCYfdGXzzv6RwcEZ7Qrn41XQ",
  authDomain: "worktimer-11a27.firebaseapp.com",
  projectId: "worktimer-11a27",
  storageBucket: "worktimer-11a27.firebasestorage.app",
  messagingSenderId: "779028237662",
  appId: "1:779028237662:web:e8c02ade750321bb1393cf"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let entries = [];
let cloudSynced = false;
let authSessionId = 0;
let activeStorageContext = {
  kind: "initializing",
  uid: null,
  sessionId: 0
};
let profileSaveInProgress = false;

const LEGACY_ENTRIES_KEY = "entries";
const ANONYMOUS_ENTRIES_KEY =
  "worktimer:v2:entries:anonymous";

function getUserEntriesKey(uid) {
  return `worktimer:v2:entries:user:${uid}`;
}

function getUserCloudSyncedKey(uid) {
  return `worktimer:v2:cloudSynced:user:${uid}`;
}

function readStoredEntries(key) {
  try {
    const stored = localStorage.getItem(key);

    if (stored === null) return [];

    const parsed = JSON.parse(stored);

    return Array.isArray(parsed) ? parsed : [];
  }

  catch (error) {
    console.error(
      `Could not read local entries from ${key}:`,
      error
    );

    return [];
  }
}

function copyLegacyEntriesToAnonymous() {
  if (
    localStorage.getItem(
      ANONYMOUS_ENTRIES_KEY
    ) !== null
  ) {
    return;
  }

  const legacyEntries =
    localStorage.getItem(
      LEGACY_ENTRIES_KEY
    );

  if (legacyEntries === null) return;

  try {
    const parsed = JSON.parse(legacyEntries);

    if (!Array.isArray(parsed)) return;

    localStorage.setItem(
      ANONYMOUS_ENTRIES_KEY,
      legacyEntries
    );
  }

  catch (error) {
    console.error(
      "Could not copy legacy local entries:",
      error
    );
  }
}

function isActiveAuthContext(context) {
  if (
    !context ||
    context.sessionId !== authSessionId
  ) {
    return false;
  }

  const activeUid = currentUser
    ? currentUser.uid
    : null;

  return (
    context.uid === activeUid &&
    context.kind ===
      activeStorageContext.kind &&
    context.uid ===
      activeStorageContext.uid
  );
}

copyLegacyEntriesToAnonymous();

/* =========================
   UI HELPERS
========================= */

let statusTimeout;

function setSyncStatus(message) {

  const status =
    document.getElementById("saveStatus");

  if (!status) return;

  status.style.opacity = "1";

  status.innerText = message;

  clearTimeout(statusTimeout);

  statusTimeout = setTimeout(() => {

    status.style.opacity = "0";

  }, 3500);

}

function setAccountStatus(message) {
  document.getElementById("syncStatus").innerText = message;
}

function showProfileOnboarding() {
  document.getElementById(
    "profileOnboarding"
  ).style.display = "flex";
}

function hideProfileOnboarding() {
  document.getElementById(
    "profileOnboarding"
  ).style.display = "none";
}

function setProfileStatus(message) {
  document.getElementById(
    "profileStatus"
  ).innerText = message;
}

function validateProfileForm() {
  const displayName = document
    .getElementById("profileDisplayName")
    .value
    .trim();

  const selectedRole =
    document.querySelector(
      'input[name="profileRole"]:checked'
    );

  const validRoles = [
    "worker",
    "teamLeader"
  ];

  const roleIsValid =
    selectedRole &&
    validRoles.includes(
      selectedRole.value
    );

  document.getElementById(
    "profileSaveButton"
  ).disabled =
    profileSaveInProgress ||
    !displayName ||
    !roleIsValid;
}

async function saveProfile() {
  if (profileSaveInProgress) return;

  const user = currentUser;

  const displayName = document
    .getElementById("profileDisplayName")
    .value
    .trim();

  const selectedRole =
    document.querySelector(
      'input[name="profileRole"]:checked'
    );

  const workerNumber = document
    .getElementById("profileWorkerNumber")
    .value
    .trim();

  const validRoles = [
    "worker",
    "teamLeader"
  ];

  if (!user) {
    setProfileStatus(
      "Sign in to save your profile."
    );
    return;
  }

  if (
    !displayName ||
    !selectedRole ||
    !validRoles.includes(
      selectedRole.value
    )
  ) {
    setProfileStatus(
      "Enter a display name and choose a role."
    );

    validateProfileForm();
    return;
  }

  const timestamp =
    firebase.firestore.FieldValue.serverTimestamp();

  const profile = {
    schemaVersion: 1,
    role: selectedRole.value,
    displayName,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (workerNumber) {
    profile.workerNumber = workerNumber;
  }

  const profileRef = db
    .collection("users")
    .doc(user.uid);

  profileSaveInProgress = true;
  validateProfileForm();
  setProfileStatus("Saving profile...");

  try {
    await db.runTransaction(
      async transaction => {
        const profileDoc =
          await transaction.get(
            profileRef
          );

        if (profileDoc.exists) {
          const error = new Error(
            "Profile already exists"
          );

          error.name =
            "ProfileAlreadyExistsError";

          throw error;
        }

        transaction.set(
          profileRef,
          profile
        );
      }
    );

    if (
      !currentUser ||
      currentUser.uid !== user.uid
    ) {
      return;
    }

    setProfileStatus("Profile saved.");
    console.log("Profile saved");

    await new Promise(resolve => {
      setTimeout(resolve, 1000);
    });

    if (
      currentUser &&
      currentUser.uid === user.uid
    ) {
      hideProfileOnboarding();
    }
  }

  catch (error) {
    console.error(
      "Profile save failed:",
      error
    );

    if (
      !currentUser ||
      currentUser.uid !== user.uid
    ) {
      return;
    }

    if (
      error.name ===
      "ProfileAlreadyExistsError"
    ) {
      setProfileStatus(
        "A profile already exists for this account."
      );
    }

    else if (
      error.code === "permission-denied" ||
      error.code === "unauthenticated"
    ) {
      setProfileStatus(
        "Profile could not be saved. Please sign in again."
      );
    }

    else if (
      error.code === "unavailable"
    ) {
      setProfileStatus(
        "Network error. Check your connection and try again."
      );
    }

    else {
      setProfileStatus(
        "Could not save profile. Please try again."
      );
    }
  }

  finally {
    profileSaveInProgress = false;

    if (
      currentUser &&
      currentUser.uid === user.uid
    ) {
      validateProfileForm();
    }
  }
}

function showSignedOutUI() {
  document.getElementById("authForm").style.display = "flex";
  document.getElementById("signedInPanel").style.display = "none";

  hideProfileOnboarding();

  setAccountStatus("Not signed in");
}

function showSignedInUI(user) {
  document.getElementById("authForm").style.display = "none";

  document.getElementById("signedInPanel").style.display = "flex";

  document.getElementById("userInfo").innerText =
    user.email;

  setAccountStatus("Signed in");
}

/* =========================
   AUTH
========================= */

function register() {
  const email =
    document.getElementById("email").value.trim();

  const password =
    document.getElementById("password").value;

  if (!email || !password) {
    alert("Enter email and password");
    return;
  }

  auth
    .createUserWithEmailAndPassword(
      email,
      password
    )
    .then(() => {
      alert("Account created");
    })
    .catch(error => {

      if (error.code === "auth/email-already-in-use") {
        alert("This email is already registered");
      }

      else if (error.code === "auth/invalid-email") {
        alert("Invalid email address");
      }

      else if (error.code === "auth/weak-password") {
        alert("Password should be at least 6 characters");
      }

      else {
        alert("Registration error");
      }

    });
}

function login() {
  const email =
    document.getElementById("email").value.trim();

  const password =
    document.getElementById("password").value;

  if (!email || !password) {
    alert("Enter email and password");
    return;
  }

  auth
    .signInWithEmailAndPassword(
      email,
      password
    )
    .catch(error => {

      if (error.code === "auth/user-not-found") {
        alert("Account not found");
      }

      else if (error.code === "auth/wrong-password") {
        alert("Incorrect password");
      }

      else if (error.code === "auth/invalid-email") {
        alert("Invalid email");
      }

      else {
        alert("Sign in error");
      }

    });
}

function resetPassword() {
  const email =
    document.getElementById("email").value.trim();

  if (!email) {
    setAccountStatus("Enter your email first.");
    return;
  }

  setAccountStatus("Sending password reset email...");

  auth
    .sendPasswordResetEmail(email)
    .then(() => {
      setAccountStatus(
        "Password reset email sent. Check your inbox."
      );
    })
    .catch(error => {
      if (error.code === "auth/invalid-email") {
        setAccountStatus("Enter a valid email address.");
      }

      else if (error.code === "auth/too-many-requests") {
        setAccountStatus(
          "Too many attempts. Please try again later."
        );
      }

      else if (error.code === "auth/network-request-failed") {
        setAccountStatus(
          "Network error. Check your connection and try again."
        );
      }

      else {
        setAccountStatus(
          "Could not send the reset email. Please try again."
        );
      }
    });
}

function logout() {
  auth.signOut();
}

async function checkProfile(user) {
  try {
    const profileDoc = await db
      .collection("users")
      .doc(user.uid)
      .get();

    if (
      !currentUser ||
      currentUser.uid !== user.uid
    ) {
      return;
    }

    if (profileDoc.exists) {
      hideProfileOnboarding();

      console.log("Profile found");
    }

    else {
      showProfileOnboarding();

      console.log("Profile not found");
    }
  }

  catch (error) {
    hideProfileOnboarding();

    console.error(
      "Profile check failed:",
      error
    );
  }
}

auth.onAuthStateChanged(async user => {
  const sessionId = ++authSessionId;
  const uid = user ? user.uid : null;

  currentUser = user;
  entries = [];
  cloudSynced = false;
  activeStorageContext = user
    ? {
        kind: "user",
        uid,
        sessionId
      }
    : {
        kind: "anonymous",
        uid: null,
        sessionId
      };

  updateJournal();
  updateWeek();

  if (user) {
    const context = {
      ...activeStorageContext
    };

    showSignedInUI(user);

    checkProfile(user);

    setSyncStatus(
      "Checking cloud records..."
    );

    const cloudEntries =
      await loadCloudEntries(context);

    if (
      cloudEntries === null ||
      !isActiveAuthContext(context)
    ) {
      return;
    }

    if (cloudEntries.length > 0) {
      entries = cloudEntries;
      cloudSynced = true;

      localStorage.setItem(
        getUserCloudSyncedKey(uid),
        "true"
      );

      saveLocalEntries(context);

      setSyncStatus(
        "Cloud data loaded and synced"
      );
    }

    else {
      loadLocalEntries(context);

      if (
        entries.length > 0 &&
        !cloudSynced
      ) {
        const imported =
          await importLocalToCloud(
            context,
            false
          );

        if (
          !imported ||
          !isActiveAuthContext(context)
        ) {
          return;
        }
      }

      else {
        setSyncStatus(
          "No cloud records yet"
        );
      }
    }

    if (isActiveAuthContext(context)) {
      updateJournal();
      updateWeek();
    }
  }

  else {
    const context = {
      ...activeStorageContext
    };

    showSignedOutUI();

    loadLocalEntries(context);

    if (isActiveAuthContext(context)) {
      updateJournal();
      updateWeek();
    }
  }
});

/* =========================
   LOCAL / CLOUD
========================= */

function getEntriesKey(context) {
  return context.kind === "user"
    ? getUserEntriesKey(context.uid)
    : ANONYMOUS_ENTRIES_KEY;
}

function loadLocalEntries(
  context = activeStorageContext
) {
  if (!isActiveAuthContext(context)) return;

  entries = readStoredEntries(
    getEntriesKey(context)
  );

  cloudSynced =
    context.kind === "user" &&
    localStorage.getItem(
      getUserCloudSyncedKey(context.uid)
    ) === "true";
}

function saveLocalEntries(
  context = activeStorageContext
) {
  if (!isActiveAuthContext(context)) return;

  localStorage.setItem(
    getEntriesKey(context),
    JSON.stringify(entries)
  );
}

async function loadCloudEntries(context) {
  const snapshot = await db
    .collection("users")
    .doc(context.uid)
    .collection("entries")
    .orderBy("date", "desc")
    .get();

  if (!isActiveAuthContext(context)) {
    return null;
  }

  const loadedEntries = [];

  snapshot.forEach(doc => {
    loadedEntries.push(doc.data());
  });

  return loadedEntries;
}

async function saveEntryToCloud(
  entry,
  context
) {
  await db
    .collection("users")
    .doc(context.uid)
    .collection("entries")
    .doc(entry.date)
    .set(entry);

  if (!isActiveAuthContext(context)) {
    return false;
  }

  cloudSynced = true;

  localStorage.setItem(
    getUserCloudSyncedKey(context.uid),
    "true"
  );

  setSyncStatus(
    "Last entry synced to cloud"
  );

  return true;
}

async function deleteEntryFromCloud(
  date,
  context
) {
  await db
    .collection("users")
    .doc(context.uid)
    .collection("entries")
    .doc(date)
    .delete();

  if (!isActiveAuthContext(context)) {
    return false;
  }

  setSyncStatus(
    "Entry deleted from cloud"
  );

  return true;
}

async function importLocalToCloud(
  context,
  showAlert = true
) {
  if (
    context.kind !== "user" ||
    !isActiveAuthContext(context)
  ) {
    alert("Sign in first");
    return false;
  }

  const localEntries = readStoredEntries(
    getUserEntriesKey(context.uid)
  );

  if (localEntries.length === 0) {
    setSyncStatus(
      "No local records to import"
    );

    return true;
  }

  setSyncStatus(
    "Syncing local records..."
  );

  for (const entry of localEntries) {
    if (!isActiveAuthContext(context)) {
      return false;
    }

    const saved = await saveEntryToCloud(
      entry,
      context
    );

    if (!saved) return false;
  }

  const cloudEntries =
    await loadCloudEntries(context);

  if (
    cloudEntries === null ||
    !isActiveAuthContext(context)
  ) {
    return false;
  }

  entries = cloudEntries;

  cloudSynced = true;

  localStorage.setItem(
    getUserCloudSyncedKey(context.uid),
    "true"
  );

  saveLocalEntries(context);

  updateJournal();
  updateWeek();

  setSyncStatus(
    "All local records synced to cloud"
  );

  if (showAlert) {
    alert(
      "Local records synced to cloud"
    );
  }

  return true;
}

/* =========================
   TIME
========================= */

function timeToMinutes(time) {
  const [h, m] =
    time.split(":").map(Number);

  return h * 60 + m;
}

function roundToQuarter(hours) {
  return Math.round(hours * 4) / 4;
}

/* =========================
   PAYROLL
========================= */

function getPayrollStart() {
  const start = new Date(
    2026,
    2,
    22
  );

  start.setHours(0, 0, 0, 0);

  return start;
}

function getWeekNumber(date) {
  const d = new Date(date);

  d.setHours(0, 0, 0, 0);

  const start = getPayrollStart();

  const diffDays = Math.floor(
    (d - start) /
      (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return 1;

  return (
    Math.floor(diffDays / 7) + 1
  );
}

function getWeekRange(weekNumber) {
  const start = getPayrollStart();

  const weekStart = new Date(start);

  weekStart.setDate(
    start.getDate() +
      (weekNumber - 1) * 7
  );

  const weekEnd = new Date(weekStart);

  weekEnd.setDate(
    weekStart.getDate() + 6
  );

  return {
    start: weekStart,
    end: weekEnd
  };
}

function formatDate(date) {
  return date.toLocaleDateString(
    "en-GB"
  );
}

function toggleNoteField() {
  const note = document.getElementById("note");

  if (!note) return;

  if (note.style.display === "none" || note.style.display === "") {
    note.style.display = "block";
    note.focus();
  } else {
    note.style.display = "none";
  }
}

function openNoteModal(text) {
  document.getElementById("noteModalText").innerText = text;
  document.getElementById("noteModal").style.display = "flex";
}

function closeNoteModal() {
  document.getElementById("noteModal").style.display = "none";
}

/* =========================
   CALCULATE
========================= */

async function calculate() {
  const operationContext = {
    ...activeStorageContext
  };

  const dateValue =
    document.getElementById(
      "workDate"
    ).value;

  const startVal =
    document.getElementById(
      "start"
    ).value;

  const finishVal =
    document.getElementById(
      "finish"
    ).value;

  if (
    !dateValue ||
    !startVal ||
    !finishVal
  ) {
    alert("Fill all fields");
    return;
  }

  const start =
    timeToMinutes(startVal);

  const finish =
    timeToMinutes(finishVal);

  if (finish <= start) {
    alert(
      "Finish must be after start"
    );

    return;
  }

  const b1 = Number(
    document.getElementById("b1")
      .value
  );

  const lunch = Number(
    document.getElementById(
      "lunch"
    ).value
  );

  const b2 = Number(
    document.getElementById("b2")
      .value
  );

  const t1 = timeToMinutes("10:00");
  const t2 = timeToMinutes("12:30");
  const t3 = timeToMinutes("15:00");

  let breakMin = 0;

  if (finish > t1) breakMin += b1;
  if (finish > t2)
    breakMin += lunch;
  if (finish > t3) breakMin += b2;

  const totalMinutes =
    finish - start - breakMin;

  const hours = roundToQuarter(
    totalMinutes / 60
  );

  const note = document.getElementById("note").value.trim();
const entry = {
  date: dateValue,
  start: startVal,
  finish: finishVal,
  b1,
  lunch,
  b2,
  hours,
  note
};

  const index =
    entries.findIndex(
      e => e.date === dateValue
    );

  if (index >= 0) {
    entries[index] = entry;
  }

  else {
    entries.push(entry);
  }

  entries.sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  saveLocalEntries(operationContext);

  if (operationContext.kind === "user") {
    const saved = await saveEntryToCloud(
      entry,
      operationContext
    );

    if (
      !saved ||
      !isActiveAuthContext(
        operationContext
      )
    ) {
      return;
    }
  }

  else {
    setSyncStatus(
      "Saved locally only"
    );
  }

  document.getElementById(
    "result"
  ).style.display = "block";

  document.getElementById(
    "result"
  ).innerText =
    "Today: " +
    hours.toFixed(2) +
    " h";

  const noteField = document.getElementById("note");
noteField.value = "";
noteField.style.display = "none";
  
  updateJournal();
  updateWeek();
}

/* =========================
   WEEK
========================= */

function updateWeek() {
  const selectedDate =
    document.getElementById(
      "workDate"
    ).value
      ? new Date(
          document.getElementById(
            "workDate"
          ).value
        )
      : new Date();

  const weekNumber =
    getWeekNumber(selectedDate);

  const range =
    getWeekRange(weekNumber);

  document.getElementById(
    "weekNumber"
  ).innerText =
    `${weekNumber} (${formatDate(
      range.start
    )} - ${formatDate(
      range.end
    )})`;

  const total = entries
    .filter(
      e =>
        getWeekNumber(
          new Date(e.date)
        ) === weekNumber
    )
    .reduce(
      (sum, e) =>
        sum +
        Number(e.hours || 0),
      0
    );

  document.getElementById(
    "week"
  ).innerText =
    total.toFixed(2);
}

/* =========================
   EDIT / DELETE
========================= */

function editEntry(date) {
  const entry = entries.find(
    e => e.date === date
  );

  if (!entry) return;

  document.getElementById(
    "workDate"
  ).value = entry.date;

  document.getElementById(
    "start"
  ).value = entry.start;

  document.getElementById(
    "finish"
  ).value = entry.finish;

  document.getElementById(
    "b1"
  ).value = entry.b1;

  const noteField = document.getElementById("note");
noteField.value = entry.note || "";

if (entry.note) {
  noteField.style.display = "block";
} else {
  noteField.style.display = "none";
}
  
  document.getElementById(
    "lunch"
  ).value = entry.lunch;

  document.getElementById(
    "b2"
  ).value = entry.b2;

  updateWeek();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

async function deleteEntry(date) {
  if (!confirm("Delete entry?"))
    return;

  const operationContext = {
    ...activeStorageContext
  };

  entries = entries.filter(
    e => e.date !== date
  );

  saveLocalEntries(operationContext);

  if (operationContext.kind === "user") {
    const deleted =
      await deleteEntryFromCloud(
        date,
        operationContext
      );

    if (
      !deleted ||
      !isActiveAuthContext(
        operationContext
      )
    ) {
      return;
    }
  }

  updateJournal();
  updateWeek();
}

/* =========================
   JOURNAL
========================= */

function updateJournal() {
  const journal =
    document.getElementById(
      "journal"
    );

  journal.innerHTML = "";

  if (entries.length === 0) {
    journal.innerHTML =
      "<p>No entries</p>";

    return;
  }

  const groups = {};

  entries.forEach(e => {
    const w = getWeekNumber(
      new Date(e.date)
    );

    if (!groups[w]) {
      groups[w] = [];
    }

    groups[w].push(e);
  });

  const weeks = Object.keys(groups)
    .map(Number)
    .sort((a, b) => b - a);

  weeks.forEach(w => {
    const list = groups[w];

    const total = list.reduce(
      (s, e) =>
        s +
        Number(e.hours || 0),
      0
    );

    const range =
      getWeekRange(w);

    const header =
      document.createElement("h4");

    header.className =
      "week-header";

    header.innerText =
      `Week ${w} (${formatDate(
        range.start
      )} - ${formatDate(
        range.end
      )}) — ${total.toFixed(2)} h`;

    journal.appendChild(header);

    list
      .sort((a, b) =>
        b.date.localeCompare(a.date)
      )
      .forEach(e => {
        const row =
          document.createElement(
            "div"
          );

        row.className = "entry";

        const info =
          document.createElement(
            "div"
          );

        const dayName = new Date(e.date).toLocaleDateString("en-GB", {
  weekday: "long"
});
        
        
        info.className =
          "entry-info";

        info.innerHTML = `<strong>${dayName} • ${e.date}</strong><br>
          ${e.start} - ${e.finish}<br>
          ${Number(
            e.hours || 0
          ).toFixed(2)} h
        `;

        const actions =
          document.createElement(
            "div"
          );

        if (e.note) {
  const noteIndicator = document.createElement("div");
  noteIndicator.className = "entry-note";
  noteIndicator.textContent = "📝 1 note";

  noteIndicator.onclick = () => {
    openNoteModal(e.note);
  };

  info.appendChild(noteIndicator);
}
        
        actions.className =
          "entry-actions";

        const edit =
          document.createElement(
            "button"
          );

        edit.className =
          "icon-btn";

        edit.textContent = "✏️";

        edit.onclick = () =>
          editEntry(e.date);

        const del =
          document.createElement(
            "button"
          );

        del.className =
          "icon-btn";

        del.textContent = "🗑️";

        del.onclick = () =>
          deleteEntry(e.date);

        actions.appendChild(edit);

        actions.appendChild(del);

        row.appendChild(info);

        row.appendChild(actions);

        journal.appendChild(row);
      });
  });
}

/* =========================
   INIT
========================= */

document.getElementById(
  "workDate"
).value =
  new Date()
    .toISOString()
    .split("T")[0];

document.getElementById(
  "profileDisplayName"
).addEventListener(
  "input",
  validateProfileForm
);

document.querySelectorAll(
  'input[name="profileRole"]'
).forEach(roleInput => {
  roleInput.addEventListener(
    "change",
    validateProfileForm
  );
});

validateProfileForm();

updateJournal();
updateWeek();
