# Only updater-driven restarts are silent. Manual installation remains assisted.
# Also supports older clients that send --updated --force-run without /S.
!macro customInit
  ${If} ${isUpdated}
    ${If} ${isForceRun}
      SetSilent silent
    ${EndIf}
  ${EndIf}
!macroend
