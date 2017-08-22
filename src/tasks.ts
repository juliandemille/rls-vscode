// Copyright 2017 The RLS Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

import {
    Disposable,
    TaskProvider,
    Task,
    TaskDefinition,
    TaskGroup,
    TaskPanelKind,
    TaskPresentationOptions,
    TaskRevealKind,
    ShellExecution,
    ShellExecutionOptions,
    window,
    workspace,
    WorkspaceConfiguration,
} from 'vscode';

function getConfiguration(): { config: WorkspaceConfiguration; hasOtherTasks: boolean } {
    const config = workspace.getConfiguration();
    const hasOtherTasks: boolean = !!config['tasks'];

    return {
        config,
        hasOtherTasks,
    };
}

export async function addBuildCommandsOnOpeningProject(): Promise<string | undefined> {
    const { config, hasOtherTasks } = getConfiguration();
    if (hasOtherTasks) {
        return;
    }

    return addBuildCommands(config);
}

export async function addBuildCommandsByUser(): Promise<string | undefined> {
    const { config, hasOtherTasks } = getConfiguration();
    if (hasOtherTasks) {
        return Promise.resolve(window.showInformationMessage('tasks.json has other tasks. Any tasks are not added.'));
    }

    return addBuildCommands(config);
}

async function addBuildCommands(config: WorkspaceConfiguration): Promise<string | undefined> {
    try {
        const tasks = createDefaultTaskConfig();
        await Promise.resolve(config.update('tasks', tasks, false));
    }
    catch (e) {
        console.error(e);
        return Promise.resolve(window.showInformationMessage('Could not update tasks.json. Any tasks are not added.'));
    }

    return Promise.resolve(window.showInformationMessage('Added default build tasks for Rust'));    
}

function createDefaultTaskConfig(): object {
    const tasks = {
        //Using the post VSC 1.14 task schema.
        "version": "2.0.0",
        "presentation" : { "reveal": "always", "panel":"new" },
        "tasks": [
            {
                "taskName": "cargo build",
                "type": "shell",
                "command": "cargo",
                "args": ["build"],
                "group": "build",
                "problemMatcher": "$rustc"
            },
            {
                "taskName": "cargo run",
                "type": "shell",
                "command": "cargo",
                "args": ["run"],
                "problemMatcher": "$rustc"
            },
            {
                "taskName": "cargo test",
                "type": "shell",
                "command": "cargo",
                "args": ["test"],
                "group": "test",
                "problemMatcher": "$rustc"
            },
            {
                "taskName": "cargo clean",
                "type": "shell",
                "command": "cargo",
                "args": ["clean"]
            }
        ]
    };

    return tasks;
}

let taskProvider: Disposable | null = null;

export function activateTaskProvider(): void {
    if (taskProvider !== null) {
        console.log('the task provider has been activated');
        return;
    }

    const provider: TaskProvider = {
        provideTasks: function ()  {
            // npm or others parse their task definitions. So they need to provide 'autoDetect' feature.
            //  e,g, https://github.com/Microsoft/vscode/blob/de7e216e9ebcad74f918a025fc5fe7bdbe0d75b2/extensions/npm/src/main.ts
            // However, cargo.toml does not support to define a new task like them.
            // So we are not 'autoDetect' feature and the setting for it.
            return getCargoTasks();
        },
        resolveTask(_task: Task): Task | undefined {
            return undefined;
        }
    };

    taskProvider = workspace.registerTaskProvider('rust', provider);
}

export function deactivateTaskProvider(): void {
    if (taskProvider !== null) {
        taskProvider.dispose();
    }
}

interface CargoTaskDefinition extends TaskDefinition {
    // FIXME: By the document, we should add the `taskDefinitions` section to our package.json and use the value of it.
    type: 'shell';
    taskName: string;
    command: string;
    args: Array<string>;
}

interface TaskConfigItem {
    definition: CargoTaskDefinition;
    problemMatcher?: Array<string>;
    group?: TaskGroup;
    presentationOptions?: TaskPresentationOptions;
}

function getCargoTasks(): Array<Task> {
    const problemMatcher = ['$rustc'];

    const presentationOptions: TaskPresentationOptions = {
        reveal: TaskRevealKind.Always,
        panel: TaskPanelKind.New,
    };

    const taskList: Array<TaskConfigItem> = [
        {
            definition: {
                taskName: 'cargo build',
                type: 'shell',
                command: 'cargo',
                args: [
                    'build'
                ],
            },
            problemMatcher,
            group: TaskGroup.Build,
            presentationOptions,
        },
        {
            definition: {
                taskName: 'cargo run',
                type: 'shell',
                command: 'cargo',
                args: [
                    'run'
                ],
            },
            problemMatcher,
            group: TaskGroup.Build,
            presentationOptions,
        },
        {
            definition: {
                taskName: 'cargo test',
                type: 'shell',
                command: 'cargo',
                args: [
                    'test'
                ],
            },
            problemMatcher,
            group: TaskGroup.Test,
            presentationOptions,
        },
        {
            definition: {
                taskName: 'cargo clean',
                type: 'shell',
                command: 'cargo',
                args: [
                    'clean'
                ],
            },
            group: TaskGroup.Clean,
            presentationOptions,
        },
    ];

    const rootPath = workspace.rootPath;
    if (rootPath === undefined) {
        console.error('`workspace.rootPath` is `undefined`');
        return [];
    }

    const list = taskList.map((def) => {
        const t = createTask(rootPath, def);
        return t;
    });

    return list;
}

function createTask(rootPath: string, { definition, group, presentationOptions, problemMatcher }: TaskConfigItem): Task {
    const TASK_SOURCE = 'Rust';

    const execCmd = `${definition.command} ${definition.args.join(' ')}`;
    const execOption: ShellExecutionOptions = {
        cwd: rootPath,
    };
    const exec = new ShellExecution(execCmd, execOption);

    const t = new Task(definition, definition.taskName, TASK_SOURCE, exec, problemMatcher);

    if (group !== undefined) {
        t.group = group;
    }

    if (presentationOptions !== undefined) {
        t.presentationOptions = presentationOptions;
    }

    return t;
}