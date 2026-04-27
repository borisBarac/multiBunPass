import { z } from "zod";

export const ListVMSchema = z.object({});

export const CreateVMSchema = z.object({
	name: z.string().describe("Name for the new VM"),
	localPath: z
		.string()
		.describe("Local project folder path to transfer into the VM"),
	remotePath: z
		.string()
		.optional()
		.describe("Remote destination path inside the VM (default: ~/app/)"),
});

export const DeleteVMSchema = z.object({
	name: z.string().describe("Name of the VM to delete"),
});

export const InfoVMSchema = z.object({
	name: z.string().describe("Name of the VM to inspect"),
});

export const StartVMSchema = z.object({
	name: z.string().describe("Name of the VM to start"),
});

export const StopVMSchema = z.object({
	name: z.string().describe("Name of the VM to stop"),
});

export const StatusVMSchema = z.object({
	name: z.string().describe("Name of the VM to check"),
});

export const ExecVMSchema = z.object({
	name: z.string().describe("Name of the VM to run the command in"),
	command: z
		.string()
		.describe(
			"Shell command to execute inside the VM (runs in the project directory by default)",
		),
	localPath: z
		.string()
		.optional()
		.describe("Local project folder path (used to create VM handle)"),
	remotePath: z
		.string()
		.optional()
		.describe("Remote destination path inside the VM (default: ~/app/)"),
	timeout: z
		.number()
		.default(60)
		.describe("Seconds before killing the process (default: 60)"),
});

export const SyncVMSchema = z.object({
	name: z.string().describe("Name of the VM to sync code to"),
	localPath: z.string().describe("Local project folder path to transfer"),
	remotePath: z
		.string()
		.optional()
		.describe("Remote destination path inside the VM"),
});
