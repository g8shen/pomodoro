var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
var DEFAULT_DATA = {
    targetPerDay: 8,
    focusMinutes: 25,
    restMinutes: 5,
    autoSwitch: true,
    activeTaskId: null,
    tasks: [],
    sessions: []
};
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var dataFilePath = path.resolve(__dirname, "../data/pomodoro-data.json");
function normalizeFocusedSeconds(value, startedAt, endedAt) {
    var numeric = typeof value === "number" ? value : Number.NaN;
    if (!Number.isFinite(numeric)) {
        return null;
    }
    var focusedSeconds = Math.max(1, Math.round(numeric));
    var elapsedSeconds = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
    if (focusedSeconds === 1 && elapsedSeconds > 60) {
        return elapsedSeconds;
    }
    return focusedSeconds;
}
function clampMinuteValue(value, fallback) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 180) {
        return fallback;
    }
    return Math.round(numeric * 1000) / 1000;
}
function normalizeTask(input) {
    if (!input || typeof input !== "object") {
        return null;
    }
    var maybe = input;
    if (typeof maybe.id !== "string" || typeof maybe.name !== "string" || typeof maybe.createdAt !== "string") {
        return null;
    }
    var created = new Date(maybe.createdAt);
    if (Number.isNaN(created.getTime())) {
        return null;
    }
    var name = maybe.name.trim();
    if (!name) {
        return null;
    }
    return {
        id: maybe.id,
        name: name,
        createdAt: created.toISOString()
    };
}
function normalizeSession(input) {
    if (!input || typeof input !== "object") {
        return null;
    }
    var maybe = input;
    var started = typeof maybe.startedAt === "string" ? new Date(maybe.startedAt) : null;
    var ended = typeof maybe.endedAt === "string" ? new Date(maybe.endedAt) : null;
    if (!started || !ended || Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
        return null;
    }
    var focusedSeconds = normalizeFocusedSeconds(maybe.focusedSeconds, started, ended);
    if (focusedSeconds === null) {
        return null;
    }
    return {
        startedAt: started.toISOString(),
        endedAt: ended.toISOString(),
        taskId: typeof maybe.taskId === "string" ? maybe.taskId : null,
        focusedSeconds: focusedSeconds
    };
}
function sanitizeData(raw) {
    var tasks = Array.isArray(raw.tasks)
        ? raw.tasks
            .map(function (task) { return normalizeTask(task); })
            .filter(function (task) { return task !== null; })
            .sort(function (a, b) { return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); })
        : [];
    var taskIds = new Set(tasks.map(function (task) { return task.id; }));
    var sessions = Array.isArray(raw.sessions)
        ? raw.sessions
            .map(function (session) { return normalizeSession(session); })
            .filter(function (session) { return session !== null; })
            .map(function (session) { return ({
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            taskId: session.taskId && taskIds.has(session.taskId) ? session.taskId : null,
            focusedSeconds: Math.max(1, Math.round(session.focusedSeconds))
        }); })
            .sort(function (a, b) { return new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime(); })
        : [];
    var activeTaskId = typeof raw.activeTaskId === "string" && taskIds.has(raw.activeTaskId) ? raw.activeTaskId : null;
    return {
        targetPerDay: typeof raw.targetPerDay === "number" && raw.targetPerDay > 0
            ? Math.floor(raw.targetPerDay)
            : DEFAULT_DATA.targetPerDay,
        focusMinutes: clampMinuteValue(raw.focusMinutes, DEFAULT_DATA.focusMinutes),
        restMinutes: clampMinuteValue(raw.restMinutes, DEFAULT_DATA.restMinutes),
        autoSwitch: typeof raw.autoSwitch === "boolean" ? raw.autoSwitch : DEFAULT_DATA.autoSwitch,
        activeTaskId: activeTaskId,
        tasks: tasks,
        sessions: sessions
    };
}
function ensureDataFile() {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 5]);
                    return [4 /*yield*/, fs.access(dataFilePath)];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 2:
                    _a = _b.sent();
                    return [4 /*yield*/, fs.mkdir(path.dirname(dataFilePath), { recursive: true })];
                case 3:
                    _b.sent();
                    return [4 /*yield*/, fs.writeFile(dataFilePath, JSON.stringify(DEFAULT_DATA, null, 2), "utf-8")];
                case 4:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function readData() {
    return __awaiter(this, void 0, void 0, function () {
        var raw, parsed, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ensureDataFile()];
                case 1:
                    _b.sent();
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 6]);
                    return [4 /*yield*/, fs.readFile(dataFilePath, "utf-8")];
                case 3:
                    raw = _b.sent();
                    parsed = JSON.parse(raw);
                    return [2 /*return*/, sanitizeData(parsed)];
                case 4:
                    _a = _b.sent();
                    return [4 /*yield*/, fs.writeFile(dataFilePath, JSON.stringify(DEFAULT_DATA, null, 2), "utf-8")];
                case 5:
                    _b.sent();
                    return [2 /*return*/, __assign({}, DEFAULT_DATA)];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function writeData(data) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), "utf-8")];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function generateTaskId() {
    return "".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 8));
}
var app = express();
app.use(express.json());
app.get("/api/state", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var data, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                return [4 /*yield*/, readData()];
            case 1:
                data = _b.sent();
                res.json(data);
                return [3 /*break*/, 3];
            case 2:
                _a = _b.sent();
                res.status(500).json({ error: "Failed to read state." });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.post("/api/target", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var target, data, _a;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                target = Number((_b = req.body) === null || _b === void 0 ? void 0 : _b.targetPerDay);
                if (!Number.isInteger(target) || target < 1 || target > 100) {
                    return [2 /*return*/, res.status(400).json({ error: "targetPerDay must be an integer between 1 and 100." })];
                }
                return [4 /*yield*/, readData()];
            case 1:
                data = _c.sent();
                data.targetPerDay = target;
                return [4 /*yield*/, writeData(data)];
            case 2:
                _c.sent();
                return [2 /*return*/, res.json(data)];
            case 3:
                _a = _c.sent();
                return [2 /*return*/, res.status(500).json({ error: "Failed to update target." })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post("/api/durations", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var focusMinutes, restMinutes, data, _a;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 3, , 4]);
                focusMinutes = Number((_b = req.body) === null || _b === void 0 ? void 0 : _b.focusMinutes);
                restMinutes = Number((_c = req.body) === null || _c === void 0 ? void 0 : _c.restMinutes);
                if (!Number.isFinite(focusMinutes) || focusMinutes <= 0 || focusMinutes > 180) {
                    return [2 /*return*/, res.status(400).json({ error: "focusMinutes must be a number between 0 and 180." })];
                }
                if (!Number.isFinite(restMinutes) || restMinutes <= 0 || restMinutes > 180) {
                    return [2 /*return*/, res.status(400).json({ error: "restMinutes must be a number between 0 and 180." })];
                }
                return [4 /*yield*/, readData()];
            case 1:
                data = _d.sent();
                data.focusMinutes = Math.round(focusMinutes * 1000) / 1000;
                data.restMinutes = Math.round(restMinutes * 1000) / 1000;
                return [4 /*yield*/, writeData(data)];
            case 2:
                _d.sent();
                return [2 /*return*/, res.json(data)];
            case 3:
                _a = _d.sent();
                return [2 /*return*/, res.status(500).json({ error: "Failed to update durations." })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post("/api/auto-switch", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var autoSwitch, data, _a;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                autoSwitch = (_b = req.body) === null || _b === void 0 ? void 0 : _b.autoSwitch;
                if (typeof autoSwitch !== "boolean") {
                    return [2 /*return*/, res.status(400).json({ error: "autoSwitch must be a boolean." })];
                }
                return [4 /*yield*/, readData()];
            case 1:
                data = _c.sent();
                data.autoSwitch = autoSwitch;
                return [4 /*yield*/, writeData(data)];
            case 2:
                _c.sent();
                return [2 /*return*/, res.json(data)];
            case 3:
                _a = _c.sent();
                return [2 /*return*/, res.status(500).json({ error: "Failed to update auto-switch setting." })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post("/api/task", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var name_1, data, task, _a;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                name_1 = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.name) === "string" ? req.body.name.trim() : "";
                if (!name_1) {
                    return [2 /*return*/, res.status(400).json({ error: "Task name is required." })];
                }
                return [4 /*yield*/, readData()];
            case 1:
                data = _c.sent();
                task = {
                    id: generateTaskId(),
                    name: name_1.slice(0, 80),
                    createdAt: new Date().toISOString()
                };
                data.tasks.push(task);
                if (!data.activeTaskId) {
                    data.activeTaskId = task.id;
                }
                return [4 /*yield*/, writeData(data)];
            case 2:
                _c.sent();
                return [2 /*return*/, res.json(data)];
            case 3:
                _a = _c.sent();
                return [2 /*return*/, res.status(500).json({ error: "Failed to add task." })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post("/api/task/active", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var activeTaskId_1, data, _a;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                activeTaskId_1 = (_b = req.body) === null || _b === void 0 ? void 0 : _b.activeTaskId;
                if (activeTaskId_1 !== null && typeof activeTaskId_1 !== "string") {
                    return [2 /*return*/, res.status(400).json({ error: "activeTaskId must be a string or null." })];
                }
                return [4 /*yield*/, readData()];
            case 1:
                data = _c.sent();
                if (activeTaskId_1 !== null && !data.tasks.some(function (task) { return task.id === activeTaskId_1; })) {
                    return [2 /*return*/, res.status(400).json({ error: "Task not found." })];
                }
                data.activeTaskId = activeTaskId_1;
                return [4 /*yield*/, writeData(data)];
            case 2:
                _c.sent();
                return [2 /*return*/, res.json(data)];
            case 3:
                _a = _c.sent();
                return [2 /*return*/, res.status(500).json({ error: "Failed to update active task." })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post("/api/task/delete", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var taskId_1, data, _a;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                taskId_1 = (_b = req.body) === null || _b === void 0 ? void 0 : _b.taskId;
                if (typeof taskId_1 !== "string") {
                    return [2 /*return*/, res.status(400).json({ error: "taskId is required." })];
                }
                return [4 /*yield*/, readData()];
            case 1:
                data = _c.sent();
                data.tasks = data.tasks.filter(function (task) { return task.id !== taskId_1; });
                if (data.activeTaskId === taskId_1) {
                    data.activeTaskId = null;
                }
                data.sessions = data.sessions.map(function (session) {
                    return session.taskId === taskId_1 ? __assign(__assign({}, session), { taskId: null }) : session;
                });
                return [4 /*yield*/, writeData(data)];
            case 2:
                _c.sent();
                return [2 /*return*/, res.json(data)];
            case 3:
                _a = _c.sent();
                return [2 /*return*/, res.status(500).json({ error: "Failed to delete task." })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post("/api/session", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var startedAt, endedAt, completedAt, taskId_2, focusedSecondsRaw, startedDate, endedDate, data, normalizedTaskId, nextSession, key, existing, _a;
    var _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                _h.trys.push([0, 4, , 5]);
                startedAt = (_b = req.body) === null || _b === void 0 ? void 0 : _b.startedAt;
                endedAt = (_c = req.body) === null || _c === void 0 ? void 0 : _c.endedAt;
                completedAt = (_d = req.body) === null || _d === void 0 ? void 0 : _d.completedAt;
                taskId_2 = typeof ((_e = req.body) === null || _e === void 0 ? void 0 : _e.taskId) === "string" ? req.body.taskId : null;
                focusedSecondsRaw = Number((_f = req.body) === null || _f === void 0 ? void 0 : _f.focusedSeconds);
                startedDate = typeof startedAt === "string" ? new Date(startedAt) : null;
                endedDate = typeof endedAt === "string" ? new Date(endedAt) : typeof completedAt === "string" ? new Date(completedAt) : null;
                if (!startedDate || !endedDate || Number.isNaN(startedDate.getTime()) || Number.isNaN(endedDate.getTime())) {
                    return [2 /*return*/, res.status(400).json({ error: "startedAt and endedAt must be valid ISO dates." })];
                }
                return [4 /*yield*/, readData()];
            case 1:
                data = _h.sent();
                normalizedTaskId = taskId_2 && data.tasks.some(function (task) { return task.id === taskId_2; }) ? taskId_2 : null;
                nextSession = {
                    startedAt: startedDate.toISOString(),
                    endedAt: endedDate.toISOString(),
                    taskId: normalizedTaskId,
                    focusedSeconds: Number.isFinite(focusedSecondsRaw) && focusedSecondsRaw > 0
                        ? Math.max(1, Math.round(focusedSecondsRaw))
                        : Math.max(1, Math.round((endedDate.getTime() - startedDate.getTime()) / 1000))
                };
                key = "".concat(nextSession.startedAt, "|").concat(nextSession.endedAt, "|").concat((_g = nextSession.taskId) !== null && _g !== void 0 ? _g : "none");
                existing = new Set(data.sessions.map(function (s) { var _a; return "".concat(s.startedAt, "|").concat(s.endedAt, "|").concat((_a = s.taskId) !== null && _a !== void 0 ? _a : "none"); }));
                if (!!existing.has(key)) return [3 /*break*/, 3];
                data.sessions.push(nextSession);
                data.sessions.sort(function (a, b) { return new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime(); });
                return [4 /*yield*/, writeData(data)];
            case 2:
                _h.sent();
                _h.label = 3;
            case 3: return [2 /*return*/, res.json(data)];
            case 4:
                _a = _h.sent();
                return [2 /*return*/, res.status(500).json({ error: "Failed to record session." })];
            case 5: return [2 /*return*/];
        }
    });
}); });
app.post("/api/session/delete", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var startedAt, endedAt, startedDate, endedDate, startedIso_1, endedIso_1, data, _a;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 3, , 4]);
                startedAt = (_b = req.body) === null || _b === void 0 ? void 0 : _b.startedAt;
                endedAt = (_c = req.body) === null || _c === void 0 ? void 0 : _c.endedAt;
                if (typeof startedAt !== "string" || typeof endedAt !== "string") {
                    return [2 /*return*/, res.status(400).json({ error: "startedAt and endedAt are required." })];
                }
                startedDate = new Date(startedAt);
                endedDate = new Date(endedAt);
                if (Number.isNaN(startedDate.getTime()) || Number.isNaN(endedDate.getTime())) {
                    return [2 /*return*/, res.status(400).json({ error: "startedAt and endedAt must be valid ISO dates." })];
                }
                startedIso_1 = startedDate.toISOString();
                endedIso_1 = endedDate.toISOString();
                return [4 /*yield*/, readData()];
            case 1:
                data = _d.sent();
                data.sessions = data.sessions.filter(function (session) { return !(session.startedAt === startedIso_1 && session.endedAt === endedIso_1); });
                return [4 /*yield*/, writeData(data)];
            case 2:
                _d.sent();
                return [2 /*return*/, res.json(data)];
            case 3:
                _a = _d.sent();
                return [2 /*return*/, res.status(500).json({ error: "Failed to delete session." })];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.post("/api/session/task", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var startedAt, endedAt, taskIdRaw_1, startedDate, endedDate, startedIso_2, endedIso_2, data, taskId, idx, _a;
    var _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _e.trys.push([0, 3, , 4]);
                startedAt = (_b = req.body) === null || _b === void 0 ? void 0 : _b.startedAt;
                endedAt = (_c = req.body) === null || _c === void 0 ? void 0 : _c.endedAt;
                taskIdRaw_1 = (_d = req.body) === null || _d === void 0 ? void 0 : _d.taskId;
                if (typeof startedAt !== "string" || typeof endedAt !== "string") {
                    return [2 /*return*/, res.status(400).json({ error: "startedAt and endedAt are required." })];
                }
                if (taskIdRaw_1 !== null && typeof taskIdRaw_1 !== "string") {
                    return [2 /*return*/, res.status(400).json({ error: "taskId must be a string or null." })];
                }
                startedDate = new Date(startedAt);
                endedDate = new Date(endedAt);
                if (Number.isNaN(startedDate.getTime()) || Number.isNaN(endedDate.getTime())) {
                    return [2 /*return*/, res.status(400).json({ error: "startedAt and endedAt must be valid ISO dates." })];
                }
                startedIso_2 = startedDate.toISOString();
                endedIso_2 = endedDate.toISOString();
                return [4 /*yield*/, readData()];
            case 1:
                data = _e.sent();
                taskId = taskIdRaw_1 && data.tasks.some(function (task) { return task.id === taskIdRaw_1; }) ? taskIdRaw_1 : null;
                idx = data.sessions.findIndex(function (session) { return session.startedAt === startedIso_2 && session.endedAt === endedIso_2; });
                if (idx < 0) {
                    return [2 /*return*/, res.status(404).json({ error: "Session not found." })];
                }
                data.sessions[idx] = __assign(__assign({}, data.sessions[idx]), { taskId: taskId });
                return [4 /*yield*/, writeData(data)];
            case 2:
                _e.sent();
                return [2 /*return*/, res.json(data)];
            case 3:
                _a = _e.sent();
                return [2 /*return*/, res.status(500).json({ error: "Failed to update session task." })];
            case 4: return [2 /*return*/];
        }
    });
}); });
var port = 8787;
app.listen(port, function () {
    console.log("Pomodoro API listening on http://localhost:".concat(port));
});
