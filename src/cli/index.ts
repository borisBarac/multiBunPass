#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as createCmd from "./cmds/create";
import * as deleteCmd from "./cmds/delete";
import * as execCmd from "./cmds/exec";
import * as infoCmd from "./cmds/info";
import * as listCmd from "./cmds/list";
import * as startCmd from "./cmds/start";
import * as statusCmd from "./cmds/status";
import * as stopCmd from "./cmds/stop";
import * as syncCmd from "./cmds/sync";

void yargs(hideBin(process.argv))
	.scriptName("mbp")
	.strict()
	.demandCommand(1, "You must specify a command")
	.option("json", {
		type: "boolean",
		default: false,
		description: "Output raw JSON",
	})
	.command(listCmd)
	.command(createCmd)
	.command(deleteCmd)
	.command(infoCmd)
	.command(startCmd)
	.command(stopCmd)
	.command(statusCmd)
	.command(execCmd)
	.command(syncCmd)
	.fail((msg, err) => {
		if (err) {
			process.stderr.write(`Fatal: ${err.message}\n`);
		} else if (msg) {
			process.stderr.write(`Error: ${msg}\n`);
		}
		process.exit(1);
	})
	.parse();
