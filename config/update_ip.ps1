Get-ChildItem -Path config\*.sh | ForEach-Object {
    $content = Get-Content $_.FullName
    $newContent = $content -replace "98.85.209.142", "23.23.173.118"
    $newContent | Set-Content $_.FullName
}
