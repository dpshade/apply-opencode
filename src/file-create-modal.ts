import { App, Modal, TFolder, FuzzySuggestModal, setIcon } from "obsidian";

export interface FileCreateResult {
  description: string;
  filename: string;
  folder: string;
  cancelled: boolean;
}

type FileType = "base" | "canvas";

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private folders: TFolder[];
  private onChoose: (folder: TFolder) => void;

  constructor(app: App, folders: TFolder[], onChoose: (folder: TFolder) => void) {
    super(app);
    this.folders = folders;
    this.onChoose = onChoose;
    this.setPlaceholder("Select folder...");
  }

  getItems(): TFolder[] {
    return this.folders;
  }

  getItemText(folder: TFolder): string {
    return folder.path || "/";
  }

  onChooseItem(folder: TFolder): void {
    this.onChoose(folder);
  }
}

export class FileCreateModal extends Modal {
  private description = "";
  private filename = "";
  private folder = "";
  private fileType: FileType;
  private suggestFilename: (description: string) => string;
  private resolve: (result: FileCreateResult) => void;
  private resolved = false;
  private filenameInput: HTMLInputElement | null = null;
  private folderPathText: HTMLElement | null = null;

  constructor(
    app: App,
    fileType: FileType,
    suggestFilename: (description: string) => string,
    resolve: (result: FileCreateResult) => void,
    defaultFolder?: string
  ) {
    super(app);
    this.fileType = fileType;
    this.suggestFilename = suggestFilename;
    this.resolve = resolve;
    this.folder = defaultFolder || "";
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();

    modalEl.addClass("apply-opencode-file-create");
    modalEl.dataset.type = this.fileType;

    const typeLabel = this.fileType === "base" ? "Base File" : "Canvas";
    const extension = this.fileType === "base" ? ".base" : ".canvas";
    const typeDesc = this.fileType === "base" 
      ? "Create a structured database for tracking data." 
      : "Create an infinite canvas for visual thinking.";
    const iconName = this.fileType === "base" ? "table" : "layout-dashboard";

    // --- Header ---
    const header = contentEl.createDiv({ cls: "file-create-header" });
    
    const iconContainer = header.createDiv({ cls: "file-create-icon" });
    setIcon(iconContainer, iconName);
    
    const titleContainer = header.createDiv({ cls: "file-create-title" });
    titleContainer.createEl("h2", { text: `New ${typeLabel}` });
    titleContainer.createEl("p", { text: typeDesc });

    // --- Body ---
    const body = contentEl.createDiv({ cls: "file-create-body" });

    // Description Section
    const descSection = body.createDiv({ cls: "file-create-section" });
    descSection.createDiv({ cls: "file-create-label", text: "Description" });
    
    const descInput = descSection.createEl("textarea", { 
      cls: "file-create-description",
      attr: { 
        placeholder: `Describe what you want to create...`,
        rows: "4"
      }
    });

    // Filename & Folder Section
    const metaSection = body.createDiv({ cls: "file-create-section" });
    metaSection.createDiv({ cls: "file-create-label", text: "Location & Name" });
    
    const metaRow = metaSection.createDiv({ cls: "file-create-filename-group" });
    
    // Folder Picker
    const folderPicker = metaRow.createDiv({ cls: "file-create-folder-picker" });
    folderPicker.title = "Change folder";
    
    const folderIcon = folderPicker.createDiv({ cls: "file-create-folder-icon" });
    setIcon(folderIcon, "folder");
    
    this.folderPathText = folderPicker.createDiv({ cls: "file-create-folder-path" });
    this.updateFolderDisplay();
    
    const folderArrow = folderPicker.createDiv({ cls: "file-create-folder-arrow" });
    setIcon(folderArrow, "chevron-down");

    folderPicker.addEventListener("click", () => this.openFolderPicker());

    // Filename Input
    const filenameContainer = metaRow.createDiv({ cls: "file-create-filename-input-container" });
    
    this.filenameInput = filenameContainer.createEl("input", {
      type: "text",
      cls: "file-create-filename-input",
      attr: {
        placeholder: `my-${this.fileType}`
      }
    });
    
    filenameContainer.createDiv({ cls: "file-create-extension", text: extension });

    // --- Footer ---
    const footer = contentEl.createDiv({ cls: "file-create-footer" });
    
    const cancelBtn = footer.createEl("button", { cls: "file-create-btn-cancel", text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.cancel());

    const createBtn = footer.createEl("button", { cls: "file-create-btn-create", text: "Create" });
    createBtn.addEventListener("click", () => this.submit());

    // --- Event Listeners ---
    
    descInput.addEventListener("input", (e) => {
      const value = (e.target as HTMLTextAreaElement).value;
      this.description = value;
      
      // Auto-suggest filename
      if (value.trim().length > 5 && !this.filename) {
        const suggested = this.suggestFilename(value);
        if (this.filenameInput) {
          this.filenameInput.value = suggested;
          this.filename = suggested;
        }
      }
    });

    // Focus description on open
    setTimeout(() => descInput.focus(), 50);

    this.filenameInput.addEventListener("input", (e) => {
      const value = (e.target as HTMLInputElement).value;
      // Remove extension if typed
      this.filename = value.replace(new RegExp(`\\${extension}$`), "");
    });

    // Handle Enter to submit (if focused on inputs)
    contentEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.submit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.cancel();
      }
    });
  }

  private updateFolderDisplay() {
    if (this.folderPathText) {
      this.folderPathText.setText(this.folder || "/ (Vault Root)");
    }
  }

  private openFolderPicker() {
    const folders = this.getAllFolders();
    const modal = new FolderSuggestModal(this.app, folders, (folder) => {
      this.folder = folder.path;
      this.updateFolderDisplay();
    });
    modal.open();
  }

  private getAllFolders(): TFolder[] {
    const folders: TFolder[] = [];
    const rootFolder = this.app.vault.getRoot();
    
    folders.push(rootFolder);

    const collectFolders = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          folders.push(child);
          collectFolders(child);
        }
      }
    };

    collectFolders(rootFolder);
    return folders.sort((a, b) => a.path.localeCompare(b.path));
  }

  private submit() {
    if (!this.description.trim()) {
      const descInput = this.contentEl.querySelector(".file-create-description") as HTMLElement;
      if (descInput) {
        descInput.style.borderColor = "var(--text-error)";
        setTimeout(() => descInput.style.borderColor = "", 2000);
        descInput.focus();
      }
      return;
    }

    if (!this.filename.trim()) {
      this.filename = this.suggestFilename(this.description);
    }

    this.resolved = true;
    this.resolve({
      description: this.description.trim(),
      filename: this.filename.trim(),
      folder: this.folder,
      cancelled: false,
    });
    this.close();
  }

  private cancel() {
    this.resolved = true;
    this.resolve({
      description: "",
      filename: "",
      folder: "",
      cancelled: true,
    });
    this.close();
  }

  onClose() {
    const { contentEl, modalEl } = this;
    modalEl.removeClass("apply-opencode-file-create");
    contentEl.empty();
    
    if (!this.resolved) {
      this.resolve({
        description: "",
        filename: "",
        folder: "",
        cancelled: true,
      });
    }
  }
}

export function showFileCreateModal(
  app: App,
  fileType: "base" | "canvas",
  suggestFilename: (description: string) => string,
  defaultFolder?: string
): Promise<FileCreateResult> {
  return new Promise((resolve) => {
    const modal = new FileCreateModal(app, fileType, suggestFilename, resolve, defaultFolder);
    modal.open();
  });
}
