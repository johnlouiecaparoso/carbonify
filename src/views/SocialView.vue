<template>
  <div class="social-view">
    <PageHeader
      title="Social Impact"
      description="Connect with the community and share your environmental impact."
    />

    <div class="container">

      <!-- Impact Summary -->
      <div class="impact-summary">
        <div class="impact-card">
          <div class="impact-icon">🌱</div>
          <div class="impact-content">
            <h3>Your Environmental Impact</h3>
            <div class="impact-metrics">
              <div class="metric">
                <span class="metric-label">CO₂ Offset:</span>
                <span class="metric-value">1,250 tons</span>
              </div>
              <div class="metric">
                <span class="metric-label">Trees Equivalent:</span>
                <span class="metric-value">2,500 trees</span>
              </div>
              <div class="metric">
                <span class="metric-label">Projects Supported:</span>
                <span class="metric-value">8 projects</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Social Features -->
      <div class="social-features">
        <div class="feature-grid">
          <!-- Share Impact -->
          <div class="feature-card">
            <div class="feature-header">
              <h3>Share Your Impact</h3>
              <span class="feature-icon">📢</span>
            </div>
            <p>Share your carbon credit purchases and environmental impact with your network.</p>
            <div class="feature-actions">
              <button class="action-button primary">Share on Social Media</button>
              <button class="action-button secondary">Generate Impact Report</button>
            </div>
          </div>

          <!-- Community -->
          <div class="feature-card">
            <div class="feature-header">
              <h3>Community</h3>
              <span class="feature-icon">👥</span>
            </div>
            <p>Connect with other environmentally conscious individuals and organizations.</p>
            <div class="feature-actions">
              <button class="action-button primary">Join Community</button>
              <button class="action-button secondary">View Members</button>
            </div>
          </div>

          <!-- Comments & Reviews -->
          <div class="feature-card">
            <div class="feature-header">
              <h3>Project Reviews</h3>
              <span class="feature-icon">💬</span>
            </div>
            <p>
              Share your experience with carbon credit projects and help others make informed
              decisions.
            </p>
            <div class="feature-actions">
              <button class="action-button primary">Write Review</button>
              <button class="action-button secondary">Read Reviews</button>
            </div>
          </div>

          <!-- User Profile -->
          <div class="feature-card">
            <div class="feature-header">
              <h3>Public Profile</h3>
              <span class="feature-icon">👤</span>
            </div>
            <p>
              Create a public profile to showcase your environmental commitment and achievements.
            </p>
            <div class="feature-actions">
              <button class="action-button primary">Create Profile</button>
              <button class="action-button secondary">Edit Profile</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Activity Feed -->
      <div class="activity-feed">
        <h3>Community Activity</h3>
        <div class="feed-list">
          <div class="feed-item">
            <div class="feed-avatar">👤</div>
            <div class="feed-content">
              <div class="feed-header">
                <span class="feed-user">Sarah Johnson</span>
                <span class="feed-time">2 hours ago</span>
              </div>
              <div class="feed-text">
                Just purchased 100 carbon credits from the Amazon Rainforest Protection Initiative!
                🌱
              </div>
              <div class="feed-actions">
                <button class="feed-action">👍 Like</button>
                <button class="feed-action">💬 Comment</button>
                <button class="feed-action">🔄 Share</button>
              </div>
            </div>
          </div>

          <div class="feed-item">
            <div class="feed-avatar">🏢</div>
            <div class="feed-content">
              <div class="feed-header">
                <span class="feed-user">GreenTech Corp</span>
                <span class="feed-time">5 hours ago</span>
              </div>
              <div class="feed-text">
                Our company has achieved carbon neutrality! Thanks to Carbonify for helping us offset
                5,000 tons of CO₂.
              </div>
              <div class="feed-actions">
                <button class="feed-action">👍 Like</button>
                <button class="feed-action">💬 Comment</button>
                <button class="feed-action">🔄 Share</button>
              </div>
            </div>
          </div>

          <div class="feed-item">
            <div class="feed-avatar">🌍</div>
            <div class="feed-content">
              <div class="feed-header">
                <span class="feed-user">Climate Action Group</span>
                <span class="feed-time">1 day ago</span>
              </div>
              <div class="feed-text">
                New project alert! The Solar Energy Initiative in Kenya is now available for carbon
                credit purchases.
              </div>
              <div class="feed-actions">
                <button class="feed-action">👍 Like</button>
                <button class="feed-action">💬 Comment</button>
                <button class="feed-action">🔄 Share</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import PageHeader from '@/components/layout/PageHeader.vue'
</script>

<style scoped>
.social-view .container {
  padding-top: 1.5rem;
}
.social-view {
  padding: 0 0 2rem;
  min-height: 100vh;
  background: var(--bg-secondary);
}

.impact-summary {
  margin-bottom: 3rem;
}

.impact-card {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
  color: white;
  border-radius: 16px;
  padding: 2rem;
  display: flex;
  align-items: center;
  gap: 2rem;
}

.impact-icon {
  font-size: 4rem;
  flex-shrink: 0;
}

.impact-content h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
}

.impact-metrics {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.metric-label {
  font-size: 1rem;
  opacity: 0.9;
}

.metric-value {
  font-size: 1.125rem;
  font-weight: 600;
}

.social-features {
  margin-bottom: 3rem;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.feature-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;
}

.feature-card:hover {
  transform: translateY(-2px);
}

.feature-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.feature-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.feature-icon {
  font-size: 1.5rem;
}

.feature-card p {
  color: var(--text-secondary);
  margin: 0 0 1.5rem 0;
  line-height: 1.5;
}

.feature-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.action-button {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.action-button.primary {
  background: var(--primary-color);
  color: white;
}

.action-button.primary:hover {
  background: var(--primary-hover);
}

.action-button.secondary {
  background: var(--bg-muted);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.action-button.secondary:hover {
  background: var(--border-color);
}

.activity-feed {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.activity-feed h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 1.5rem 0;
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.feed-item {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-muted);
  border-radius: 8px;
}

.feed-avatar {
  width: 2.5rem;
  height: 2.5rem;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.feed-content {
  flex: 1;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.feed-user {
  font-weight: 600;
  color: var(--text-primary);
}

.feed-time {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.feed-text {
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
  line-height: 1.5;
}

.feed-actions {
  display: flex;
  gap: 1rem;
}

.feed-action {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.875rem;
  transition: color 0.2s;
}

.feed-action:hover {
  color: var(--primary-color);
}

@media (max-width: 768px) {
  .impact-card {
    flex-direction: column;
    text-align: center;
    gap: 1rem;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .feature-actions {
    flex-direction: column;
  }

  .feed-item {
    flex-direction: column;
    gap: 0.75rem;
  }

  .feed-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
}
</style>
