export const metadata = {
  title: 'HIC Parenting — Reactivity Checklist',
  description: 'Discover Your Reactivity Type',
}

export default function ChecklistLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  )
}
