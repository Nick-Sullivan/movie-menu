use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeStep {
    pub duration_secs: u64,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recipe {
    pub name: String,
    /// Do-ahead note, shown before the first step.
    #[serde(default)]
    pub prep: String,
    pub steps: Vec<RecipeStep>,
    /// S3 key of the dish photo, uploaded via a presigned URL when the
    /// screening starts; served back through GET /images/{key}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleEntry {
    pub ready_at_secs: u64,
    pub recipe: Recipe,
}

/// What a joined viewer's screen is allowed to reveal, set by the menu owner.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewerSettings {
    /// How many upcoming dishes the viewer screen lists.
    pub upcoming_count: u32,
    /// When false, upcoming dish names are hidden (kept as a surprise).
    pub show_dish_names: bool,
}

impl Default for ViewerSettings {
    fn default() -> Self {
        Self {
            upcoming_count: 1,
            show_dish_names: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Menu {
    pub id: String,
    pub name: String,
    pub duration_secs: u64,
    pub schedule: Vec<ScheduleEntry>,
    pub started_at: Option<u64>,
    #[serde(default)]
    pub viewer: ViewerSettings,
}
