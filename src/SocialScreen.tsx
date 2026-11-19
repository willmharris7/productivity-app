// The Social page: a heading with Add project, Add contact and Edit buttons, and nothing
// else yet. The buttons don't do anything so far.
function SocialScreen() {
  return (
    <section className="projects-screen">
      <div className="sources-screen-header">
        <h2>Social</h2>
        <div className="projects-actions">
          <button type="button" className="back-button">
            Add project
          </button>
          <button type="button" className="back-button">
            Add contact
          </button>
          <button type="button" className="back-button">
            Edit
          </button>
        </div>
      </div>
    </section>
  )
}

export default SocialScreen
