!macro customInstall
  ; Preserve the language selected in the installer so Jarvis can use it
  ; as the application's initial UI language on first launch.
  WriteRegStr HKLM "Software\Jarvis" "InstallerLanguage" "$LANGUAGE"
!macroend

!macro customUnInstall
  DeleteRegValue HKLM "Software\Jarvis" "InstallerLanguage"
  DeleteRegKey /ifempty HKLM "Software\Jarvis"
!macroend
