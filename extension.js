/* exported init */

const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Meta = imports.gi.Meta;
const Workspace = imports.ui.workspace.Workspace;
const ExtensionUtils = imports.misc.extensionUtils;

class Extension {
	_toggleTerminal() {
		if (!this.cached_window_actor || !this.cached_window_actor.metaWindow || !this.cached_window_actor.metaWindow.get_workspace) {
			let windows = global.get_window_actors().filter(actor => {
				return actor.metaWindow.get_wm_class() === 'gnome-terminal-server';
			});

			// terminal has not been launched, launching new instance
			if (!windows.length) {
				imports.misc.util.trySpawnCommandLine('/usr/bin/gnome-terminal');
				return;
			}

			this.cached_window_actor = windows[0];
		}

		let win = this.cached_window_actor.metaWindow;
		let focusWindow = global.display.focus_window;

		// terminal is active, hiding
		if (win === focusWindow) {
			win.minimize();
			return;
		}

		// terminal not active, activating
		let activeWorkspace = global.workspace_manager.get_active_workspace();
		let currentMonitor = activeWorkspace.get_display().get_current_monitor();
		let onCurrentMonitor = win.get_monitor() === currentMonitor;
		if (!win.located_on_workspace(activeWorkspace)) {
			win.change_workspace(activeWorkspace);
			onCurrentMonitor || win.move_to_monitor(currentMonitor);
		} else if (win.minimized && !onCurrentMonitor) {
			win.move_to_monitor(currentMonitor);
		}
		// https://gitlab.gnome.org/GNOME/mutter/-/blob/main/src/core/keybindings.c#L3125
		let work_area = win.get_work_area_current_monitor();
		let frame_rect = win.get_frame_rect();
		activeWorkspace.activate_with_focus(win, global.get_current_time());
		win.move_frame( true, work_area.x + (work_area.width  - frame_rect.width ) / 2,
			work_area.y + (work_area.height - frame_rect.height) / 2);
	}

	enable() {
		this.settings = ExtensionUtils.getSettings();

		this.bindHotkey()
		this.settings.connect('changed::toggle-key', () => {
			this.bindHotkey()
		});

		// hide alcacritty from workspace overview
		this.hideOnOverview()
		this.settings.connect('changed::hide-on-overview', () => {
			this.hideOnOverview()
		});

		// disable animation when hiding terminal
		if (Main.wm._shouldAnimateActor) {
			this._shouldAnimateActor_bkp = Main.wm._shouldAnimateActor;
			Main.wm._shouldAnimateActor = (actor, types) => {
				if (actor.metaWindow && actor.metaWindow.get_wm_class() === 'gnome-terminal-server') return false;
				return this._shouldAnimateActor_bkp.call(Main.wm, actor, types);
			}
		}
	}

	bindHotkey() {
		Main.wm.removeKeybinding('toggle-key');
		this.cached_window_actor = null;
		let ModeType = Shell.hasOwnProperty('ActionMode') ? Shell.ActionMode : Shell.KeyBindingMode;
		Main.wm.addKeybinding('toggle-key', this.settings, Meta.KeyBindingFlags.NONE, ModeType.NORMAL | ModeType.OVERVIEW, this._toggleTerminal.bind(this));
	}

	hideOnOverview() {
		if (!Workspace.prototype._isOverviewWindow) {
			return
		}

		if (!this.settings.get_boolean('hide-on-overview')) {
			if (this._isOverviewWindow_bkp) {
				Workspace.prototype._isOverviewWindow = this._isOverviewWindow_bkp;
				this._isOverviewWindow_bkp = null;
			}
			return
		}

		this._isOverviewWindow_bkp = Workspace.prototype._isOverviewWindow;
		Workspace.prototype._isOverviewWindow = (win) => {
			if (win.get_wm_class && win.get_wm_class() === 'gnome-terminal-server') return false;
			return this._isOverviewWindow_bkp.call(Workspace, win);
		}
	}

	disable() {
		Main.wm.removeKeybinding('toggle-key');
		this.cached_window_actor = null;

		if (this._shouldAnimateActor_bkp) {
			Main.wm._shouldAnimateActor = this._shouldAnimateActor_bkp;
			this._shouldAnimateActor_bkp = null;
		}

		if (this._isOverviewWindow_bkp) {
			Workspace.prototype._isOverviewWindow = this._isOverviewWindow_bkp;
			this._isOverviewWindow_bkp = null;
		}
	}
}

function init() {
	return new Extension();
}
