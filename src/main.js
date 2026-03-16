import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { noctisLilac } from 'thememirror'

// Editor instance
let editor

// History navigation index (-1 means not navigating, 0 = last entry, 1 = second-to-last, etc.)
let historyIndex = -1
let historyLoading = false

// Project sort mode: 'alpha' (alphabetical) or 'recent' (last modified)
let projectSortMode = 'recent'

// Initialize app
async function init() {
  // Setup CodeMirror
  editor = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        noctisLilac,
        EditorView.lineWrapping,
        EditorView.updateListener.of(update => {
          if (update.docChanged && !historyLoading) resetHistoryIndex()
        }),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': {
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '14px',
            lineHeight: '1.7',
            padding: '16px 0'
          },
          '.cm-gutters': {
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '12px',
          }
        }),
      ],
    }),
    parent: document.getElementById('editor'),
  })

  // Set default path
  const defaultPath = await window.api.getDefaultPath()
  document.getElementById('path-input').value = defaultPath

  // Load projects
  await loadProjects()

  // Setup event listeners
  setupEventListeners()
  setupKeyboardShortcuts()
}

async function loadProjects() {
  const pathInput = document.getElementById('path-input')
  const dropdown = document.getElementById('project-dropdown')

  const projects = await window.api.getProjects(pathInput.value)
  dropdown.innerHTML = ''

  if (projectSortMode === 'alpha') {
    projects.sort((a, b) => a.name.localeCompare(b.name))
  } else {
    projects.sort((a, b) => b.mtime - a.mtime)
  }

  projects.forEach(({ name }) => {
    const li = document.createElement('li')
    li.textContent = name
    li.addEventListener('click', () => {
      document.getElementById('project-input').value = name
      dropdown.classList.remove('open')
      document.getElementById('sort-toggle').style.display = 'none'
      resetHistoryIndex()
    })
    dropdown.appendChild(li)
  })
}

function resetHistoryIndex() {
  historyIndex = -1
  updateHistoryButtons()
}

function updateHistoryButtons() {
  const historyNav = document.getElementById('history-nav')
  if (historyIndex >= 0) {
    historyNav.classList.add('split')
  } else {
    historyNav.classList.remove('split')
  }
}

function setupEventListeners() {
  const projectInput = document.getElementById('project-input')
  const projectToggle = document.getElementById('project-toggle')
  const projectDropdown = document.getElementById('project-dropdown')
  const pathInput = document.getElementById('path-input')
  const pathToggle = document.getElementById('path-toggle')
  const clearBtn = document.getElementById('clear-btn')
  const previousBtn = document.getElementById('previous-btn')
  const prevSplitBtn = document.getElementById('prev-split-btn')
  const nextBtn = document.getElementById('next-btn')
  const archiveBtn = document.getElementById('archive-btn')

  // Project sort toggle
  const sortToggle = document.getElementById('sort-toggle')
  const sortLabel = document.getElementById('sort-label')
  sortToggle.addEventListener('click', async () => {
    if (projectSortMode === 'alpha') {
      projectSortMode = 'recent'
      sortLabel.textContent = 'Recent'
      sortToggle.title = 'Sort by last modified'
    } else {
      projectSortMode = 'alpha'
      sortLabel.textContent = 'A\u2013Z'
      sortToggle.title = 'Sort alphabetically'
    }
    await loadProjects()
  })

  // Project dropdown toggle
  projectToggle.addEventListener('click', (e) => {
    e.stopPropagation()
    projectDropdown.classList.toggle('open')
    sortToggle.style.display = projectDropdown.classList.contains('open') ? '' : 'none'
  })

  // Reset history index when project name changes manually
  projectInput.addEventListener('change', resetHistoryIndex)

  // Path folder picker
  pathToggle.addEventListener('click', async () => {
    const selectedPath = await window.api.selectFolder(pathInput.value)
    if (selectedPath) {
      pathInput.value = selectedPath
      await window.api.saveDataPath(selectedPath)
      await loadProjects()
    }
  })

  // Save path when manually edited
  pathInput.addEventListener('change', async () => {
    await window.api.saveDataPath(pathInput.value)
    await loadProjects()
  })

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#project-combo')) {
      projectDropdown.classList.remove('open')
      sortToggle.style.display = 'none'
    }
  })

  // Clear Text button - clears editor content (undoable via Ctrl+Z)
  clearBtn.addEventListener('click', () => {
    const text = editor.state.doc.toString()
    if (text) {
      // Use replaceSelection after selecting all to make it undoable
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: '' }
      })
      resetHistoryIndex()
      showToast('Text cleared')
    }
    editor.focus()
  })

  // Previous Prompt - navigate to older prompts (decrement index)
  async function navigatePrevious() {
    const projectName = projectInput.value.trim()

    if (!projectName) {
      showToast('Please select a project first', 'error')
      projectInput.focus()
      return
    }

    const prompts = await window.api.getPrompts({
      dataPath: pathInput.value,
      projectName
    })

    if (prompts.length === 0) {
      showToast('No prompts in history', 'error')
      return
    }

    if (historyIndex === -1) {
      historyIndex = prompts.length - 1
    } else if (historyIndex === 0) {
      historyIndex = prompts.length - 1
    } else {
      historyIndex--
    }

    const promptEntry = prompts[historyIndex]
    historyLoading = true
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: promptEntry.prompt }
    })
    historyLoading = false
    updateHistoryButtons()
    showToast(`Loaded prompt ${historyIndex + 1} of ${prompts.length}`)
  }

  previousBtn.addEventListener('click', navigatePrevious)
  prevSplitBtn.addEventListener('click', navigatePrevious)

  // Next Prompt - navigate to newer prompts (increment index)
  nextBtn.addEventListener('click', async () => {
    const projectName = projectInput.value.trim()
    if (!projectName) return

    const prompts = await window.api.getPrompts({
      dataPath: pathInput.value,
      projectName
    })

    if (historyIndex >= prompts.length - 1) {
      historyIndex = 0
    } else {
      historyIndex++
    }

    const promptEntry = prompts[historyIndex]
    historyLoading = true
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: promptEntry.prompt }
    })
    historyLoading = false
    updateHistoryButtons()
    showToast(`Loaded prompt ${historyIndex + 1} of ${prompts.length}`)
  })

  // Archive button
  archiveBtn.addEventListener('click', async () => {
    const projectName = projectInput.value.trim()
    const prompt = editor.state.doc.toString()

    if (!projectName) {
      showToast('Please enter a project name', 'error')
      projectInput.focus()
      return
    }

    if (!prompt) {
      showToast('Nothing to archive', 'error')
      return
    }

    const filePath = await window.api.archivePrompt({
      dataPath: pathInput.value,
      projectName,
      prompt
    })

    // Copy to clipboard
    await navigator.clipboard.writeText(prompt)

    // Clear editor
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: '' }
    })

    // Reset history index
    resetHistoryIndex()

    // Reload projects list
    await loadProjects()

    showToast(`Archived to ${projectName}.json`, 'success', filePath)
  })
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        window.api.zoomIn()
      } else if (e.key === '-') {
        e.preventDefault()
        window.api.zoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        window.api.zoomReset()
      }
    }
  })
}

let toastTimeout
function showToast(message, type = 'success', filePath = null) {
  const toast = document.getElementById('toast')
  toast.textContent = message
  toast.className = `toast ${type} show`

  if (filePath) {
    toast.classList.add('clickable')
    toast.onclick = () => window.api.showInFolder(filePath)
  } else {
    toast.classList.remove('clickable')
    toast.onclick = null
  }

  clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show')
  }, 3000)
}

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', init)
