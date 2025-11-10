// src/db/taskStore.ts
import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as path from "node:path";

export type TaskStatus = "pending" | "done";

export interface TaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  description?: string | null;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(TASKS_FILE);
  } catch {
    await fs.writeFile(TASKS_FILE, "[]", "utf8");
  }
}

async function readTasks(): Promise<TaskRecord[]> {
  await ensureStorage();
  const raw = await fs.readFile(TASKS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as TaskRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const backupPath = `${TASKS_FILE}.corrupt-${Date.now()}`;
    try {
      await fs.rename(TASKS_FILE, backupPath);
    } catch {
      // If we fail to move the corrupt file, continue and attempt reset.
    }
    await fs.writeFile(TASKS_FILE, "[]", "utf8");
    return [];
  }
}

async function writeTasks(tasks: TaskRecord[]): Promise<void> {
  await ensureStorage();
  const tmpPath = path.join(
    DATA_DIR,
    `.tasks-${randomUUID()}.json.tmp`
  );
  const payload = JSON.stringify(tasks, null, 2);
  await fs.writeFile(tmpPath, payload, "utf8");
  try {
    await fs.rename(tmpPath, TASKS_FILE);
  } catch (err: any) {
    await fs.unlink(tmpPath).catch(() => {});
    if (err && err.code === "ENOENT") {
      await fs.writeFile(TASKS_FILE, payload, "utf8");
      return;
    }
    throw err;
  }
}

export async function listTasks(): Promise<TaskRecord[]> {
  return readTasks();
}

interface CreateTaskInput {
  title: string;
  description?: string | null;
  dueDate?: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRecord> {
  const now = new Date().toISOString();
  const task: TaskRecord = {
    id: randomUUID(),
    title: input.title,
    description: input.description ?? null,
    dueDate: input.dueDate ?? null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  const tasks = await readTasks();
  tasks.push(task);
  await writeTasks(tasks);
  return task;
}

interface UpdateTaskInput {
  id: string;
  title?: string;
  status?: TaskStatus;
  description?: string | null;
  dueDate?: string | null;
}

export async function updateTask({ id, ...updates }: UpdateTaskInput): Promise<TaskRecord> {
  const tasks = await readTasks();
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) {
    throw new Error(`Task with id ${id} not found`);
  }

  const existing = tasks[index];
  const updated: TaskRecord = {
    ...existing,
    title: updates.title ?? existing.title,
    status: updates.status ?? existing.status,
    description:
      updates.description !== undefined
        ? updates.description
        : existing.description ?? null,
    dueDate:
      updates.dueDate !== undefined
        ? updates.dueDate
        : existing.dueDate ?? null,
    updatedAt: new Date().toISOString(),
  };

  tasks[index] = updated;
  await writeTasks(tasks);
  return updated;
}

export async function deleteTask(id: string): Promise<TaskRecord> {
  const tasks = await readTasks();
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) {
    throw new Error(`Task with id ${id} not found`);
  }

  const [removed] = tasks.splice(index, 1);
  await writeTasks(tasks);
  return removed;
}

export function formatTask(task: TaskRecord): string {
  const checkbox = task.status === "done" ? "[x]" : "[ ]";
  const lines = [`- ${checkbox} ${task.title}`];
  if (task.dueDate) {
    lines.push(`  - due: ${task.dueDate}`);
  }
  if (task.description) {
    lines.push(`  - notes: ${task.description}`);
  }
  return lines.join("\n");
}

export function summarizeTasks(tasks: TaskRecord[]): string {
  if (tasks.length === 0) {
    return "No tasks stored yet.";
  }
  return tasks.map(formatTask).join("\n");
}
