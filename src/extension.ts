import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('wardy.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from wardy!');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
