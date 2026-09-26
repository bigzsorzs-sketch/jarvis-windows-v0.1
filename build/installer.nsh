!macro customInstall
  ; Preserve the language selected in the installer so Jarvis can use it
  ; as the application's initial UI language on first launch.
  WriteRegStr HKLM "Software\Jarvis" "InstallerLanguage" "$LANGUAGE"
  CreateShortCut "$SMPROGRAMS\Jarvis Upgrade.lnk" "$SYSDIR\cmd.exe" '/c ""$INSTDIR\resources\Jarvis-OneClick-Upgrade.cmd""'
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Jarvis Upgrade.lnk"
  DeleteRegValue HKLM "Software\Jarvis" "InstallerLanguage"
  DeleteRegKey /ifempty HKLM "Software\Jarvis"
!macroend
