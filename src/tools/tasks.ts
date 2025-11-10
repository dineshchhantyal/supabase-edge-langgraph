// src/tools/tasks.ts
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import {
  createTask,
  deleteTask,
  formatTask,
  listTasks,
  summarizeTasks,
  updateTask,
} from "../db/taskStore.ts";

function taskErrorMessage(action: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`tasks::${action} failed`, err);
  return `Task storage is currently unavailable (${action}): ${message}`;
}

const listTasksTool = tool(async ({ include_internal_ids }) => {
  try {
    const tasks = await listTasks();
    const summary = summarizeTasks(tasks);
    if (include_internal_ids && tasks.length > 0) {
      const idMap = tasks
        .map((task) => `- ${task.title} -> ${task.id}`)
        .join("\n");
      return `${summary}\n\nInternal IDs:\n${idMap}`;
    }
    return summary;
  } catch (err) {
    return taskErrorMessage("list", err);
  }
}, {
  name: "list_tasks",
  description: "List all stored tasks with their status and any due dates.",
  schema: z.object({
    include_internal_ids: z.boolean().optional()
  }),
});

const createTaskTool = tool(
  async ({ title, description, due_date }) => {
    try {
      const created = await createTask({
        title,
        description: description ?? null,
        dueDate: due_date ?? null,
      });
      return `Created task:\n${formatTask(created)}\n  id: ${created.id}`;
    } catch (err) {
      return taskErrorMessage("create", err);
    }
  },
  {
    name: "create_task",
    description: "Create a new task and assign it a unique id.",
    schema: z.object({
      title: z.string().min(1, "title required"),
      description: z.string().optional().nullable(),
      due_date: z.string().optional().nullable(),
    }),
  }
);

const updateTaskTool = tool(
  async ({ id, title, status, description, due_date }) => {
    try {
      const updated = await updateTask({
        id,
        title: title ?? undefined,
        status: status ?? undefined,
        description: description ?? undefined,
        dueDate: due_date ?? undefined,
      });
      return `Updated task:\n${formatTask(updated)}\n  id: ${updated.id}`;
    } catch (err) {
      return taskErrorMessage("update", err);
    }
  },
  {
    name: "update_task",
    description: "Update fields on an existing task by id.",
    schema: z.object({
      id: z.string().min(1, "id required"),
      title: z.string().optional(),
      status: z.enum(["pending", "done"]).optional(),
      description: z.string().optional().nullable(),
      due_date: z.string().optional().nullable(),
    }),
  }
);

const deleteTaskTool = tool(
  async ({ id }) => {
    try {
      const removed = await deleteTask(id);
      return `Deleted task:\n${formatTask(removed)}\n  id: ${removed.id}`;
    } catch (err) {
      return taskErrorMessage("delete", err);
    }
  },
  {
    name: "delete_task",
    description: "Delete a task permanently by id.",
    schema: z.object({
      id: z.string().min(1, "id required"),
    }),
  }
);

export const todoTools = [
  listTasksTool,
  createTaskTool,
  updateTaskTool,
  deleteTaskTool,
];

export const todoToolNode = new ToolNode(todoTools);
